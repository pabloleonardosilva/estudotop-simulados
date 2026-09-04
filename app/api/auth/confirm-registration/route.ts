import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { addHours, addMinutes, generateNumericCode, generateSecureToken, hashEmailActionToken, hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { authUserExists } from "@/lib/server/studentAccountRepair";
import { createStudentAccount, studentAccountErrorResponse } from "@/lib/server/studentAccountService";
import { publicRegistrationCodeTemplate } from "@/lib/email/studentRegistrationTemplates";

const FROM_EMAIL = "EstudoTOP <estudotop@estudotop.com.br>";
const REPLY_TO_EMAIL = "estudotop@estudotop.com.br";
const PUBLIC_CODE_EXPIRATION_MINUTES = 30;
const INVALID_CODE_RESEND_COOLDOWN_SECONDS = 60;
const EVENT_PASSWORD_SETUP_EXPIRATION_HOURS = 72;
const FIRST_ACCESS_COOKIE = "estudotop_first_access";
const FIRST_ACCESS_COOKIE_PATH = "/api/auth/first-access";

type ConfirmPayload = {
  email: string;
  code: string;
};

export async function POST(request: Request) {
  try {
    const { email: rawEmail, code: rawCode } = (await request.json()) as ConfirmPayload;
    const email = rawEmail?.trim().toLowerCase();
    const code = rawCode?.trim();

    if (!email || !code) {
      return NextResponse.json(
        { ok: false, message: "E-mail e código são obrigatórios." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: confirmation, error: confirmationError } = await supabase
      .from("student_registration_confirmations")
      .select("*")
      .eq("email", email)
      .eq("purpose", "public_signup")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (confirmationError || !confirmation) {
      return NextResponse.json(
        { ok: false, message: "Código expirado ou cadastro não encontrado. Solicite um novo código." },
        { status: 400 }
      );
    }

    if (confirmation.code_hash !== hashRegistrationValue(code)) {
      const lastAutomaticResendAt = confirmation.metadata?.source === "invalid_code_resend"
        ? new Date(confirmation.created_at).getTime()
        : 0;
      const resendCooldownActive = Date.now() - lastAutomaticResendAt < INVALID_CODE_RESEND_COOLDOWN_SECONDS * 1000;

      if (resendCooldownActive) {
        return NextResponse.json(
          {
            ok: false,
            code: "INVALID_CODE_RESEND_COOLDOWN",
            message: "Código incorreto. Um novo código já foi enviado recentemente. Use o código mais recente recebido no e-mail.",
            clear_code: true,
          },
          { status: 429 }
        );
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        void logSystemError({
          source: "api.auth.confirm_registration.resend",
          error: new Error("RESEND_API_KEY não configurada."),
          request,
        });
        return NextResponse.json(
          { ok: false, code: "INVALID_CODE_RESEND_FAILED", message: "Código incorreto. Não foi possível enviar um novo código agora." },
          { status: 500 }
        );
      }

      const newCode = generateNumericCode(6);
      const { data: replacement, error: replacementError } = await supabase
        .from("student_registration_confirmations")
        .insert({
          purpose: "public_signup",
          full_name: confirmation.full_name,
          email,
          phone: confirmation.phone,
          cpf: confirmation.cpf,
          desired_contests: confirmation.desired_contests,
          code_hash: hashRegistrationValue(newCode),
          expires_at: addMinutes(PUBLIC_CODE_EXPIRATION_MINUTES),
          metadata: { ...confirmation.metadata, source: "invalid_code_resend" },
        })
        .select("id")
        .single();

      if (replacementError || !replacement) {
        void logSystemError({ source: "api.auth.confirm_registration.resend", error: replacementError, request });
        return NextResponse.json(
          { ok: false, code: "INVALID_CODE_RESEND_FAILED", message: "Código incorreto. Não foi possível gerar um novo código agora." },
          { status: 500 }
        );
      }

      const resend = new Resend(resendApiKey);
      let emailError: unknown = null;
      try {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          replyTo: REPLY_TO_EMAIL,
          to: email,
          subject: "Novo código de confirmação — EstudoTOP Simulados",
          html: publicRegistrationCodeTemplate({
            studentName: confirmation.full_name,
            code: newCode,
            expiresInMinutes: PUBLIC_CODE_EXPIRATION_MINUTES,
          }),
        });
        emailError = result.error;
      } catch (error) {
        emailError = error;
      }

      if (emailError) {
        await supabase.from("student_registration_confirmations").delete().eq("id", replacement.id);
        void logSystemError({ source: "api.auth.confirm_registration.resend_email", error: emailError, request });
        return NextResponse.json(
          { ok: false, code: "INVALID_CODE_RESEND_FAILED", message: "Código incorreto. Não foi possível enviar um novo código agora." },
          { status: 500 }
        );
      }

      await supabase
        .from("student_registration_confirmations")
        .update({ used_at: new Date().toISOString() })
        .eq("id", confirmation.id);

      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_CODE_NEW_CODE_SENT",
          message: "O código informado está incorreto.",
          resend_message: "Enviamos automaticamente um novo código para o seu e-mail. Digite o código mais recente recebido.",
          clear_code: true,
        },
        { status: 400 }
      );
    }

    const claimedAt = new Date().toISOString();
    const { data: claimedConfirmation, error: claimError } = await supabase
      .from("student_registration_confirmations")
      .update({ used_at: claimedAt })
      .eq("id", confirmation.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimedConfirmation) {
      return NextResponse.json({ ok: false, message: "Este código já está sendo processado ou foi utilizado." }, { status: 409 });
    }

    const { data: existingStudent } = await supabase
      .from("students")
      .select("id, email, cpf")
      .or(confirmation.cpf ? `email.eq.${email},cpf.eq.${confirmation.cpf}` : `email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existingStudent) {
      // Cenário E — students existe sem conta Auth correspondente: inconsistência
      // operacional; o Auth Admin API não permite recriar usuário com o mesmo UUID.
      if (!(await authUserExists(supabase, existingStudent.id))) {
        void logSystemError({
          source: "api.auth.confirm_registration.inconsistent_account",
          error: new Error(`students sem auth.users: ${existingStudent.id}`),
          request,
        });
        return NextResponse.json(
          { ok: false, code: "ACCOUNT_INCONSISTENT", message: "Este cadastro apresenta uma inconsistência e precisa de correção administrativa. Entre em contato com o suporte." },
          { status: 409 }
        );
      }

      const cpfDuplicado = confirmation.cpf && existingStudent.cpf === confirmation.cpf;
      return NextResponse.json({ ok: false, message: cpfDuplicado ? "Este CPF já está vinculado a outro cadastro." : "Este e-mail já foi confirmado anteriormente." }, { status: 409 });
    }

    const eventId = typeof confirmation.metadata?.event_id === "string" ? confirmation.metadata.event_id : null;
    let eventSignup = false;
    if (eventId) {
      const { data: event } = await supabase.from("simulado_events").select("status,starts_at,ends_at,started_at").eq("id", eventId).maybeSingle();
      const now = Date.now();
      eventSignup = Boolean(event && event.status !== "archived" && event.status !== "closed" && new Date(event.ends_at).getTime() > now);
      if (!eventSignup) {
        await supabase.from("student_registration_confirmations").update({ used_at: null }).eq("id", confirmation.id).eq("used_at", claimedAt);
        return NextResponse.json({ ok: false, message: "O Evento não aceita mais novos cadastros." }, { status: 409 });
      }
    }

    const temporaryPassword = generateTemporaryPassword();
    let userId: string;
    try {
      const account = await createStudentAccount(supabase, {
        fullName: confirmation.full_name,
        email,
        cpf: confirmation.cpf || null,
        phone: confirmation.phone || null,
        desiredContests: confirmation.desired_contests || null,
        temporaryPassword,
        status: eventSignup ? "active" : "pending",
        extraStudentFields: { email_confirmed_at: new Date().toISOString(), ...(eventSignup ? { origin: "Evento de Simulado", origin_event_id: eventId, origin_registered_at: new Date().toISOString(), approved_at: new Date().toISOString() } : {}) },
      });
      userId = account.userId;
    } catch (error) {
      await supabase.from("student_registration_confirmations").update({ used_at: null }).eq("id", confirmation.id).eq("used_at", claimedAt);
      void logSystemError({ source: "api.auth.confirm_registration.account", error, request });
      return NextResponse.json(studentAccountErrorResponse(error, true), { status: 409 });
    }

    if (eventSignup && eventId) {
      // Cadastro originado por Evento define a senha imediatamente na própria
      // experiência, sem um terceiro e-mail. O token reutiliza exatamente o
      // mecanismo seguro de primeiro acesso (mesma tabela/propósito consumido
      // por POST /api/auth/first-access), apenas sem envio por e-mail: é
      // devolvido uma única vez, nesta resposta, para uso imediato no navegador
      // que acabou de comprovar o código. Se o aluno abandonar antes de criar a
      // senha, a conta permanece recuperável pelo fluxo convencional "Esqueci
      // minha senha" (students.approved_at foi definido acima).
      const passwordSetupToken = generateSecureToken();
      const { error: invalidateTokenError } = await supabase.from("student_registration_confirmations").update({ used_at: new Date().toISOString() }).eq("user_id", userId).eq("purpose", "first_access").is("used_at", null);
      if (invalidateTokenError) {
        void logSystemError({ source: "api.auth.confirm_registration.invalidate_first_access", error: invalidateTokenError, request, metadata: { user_id: userId, event_id: eventId } });
        return NextResponse.json({ ok: false, code: "FIRST_ACCESS_PREPARATION_FAILED", message: "Sua conta foi criada, mas não foi possível preparar a definição de senha. Abra novamente o link do Evento para continuar." }, { status: 500 });
      }
      const { error: passwordTokenError } = await supabase.from("student_registration_confirmations").insert({
        purpose: "first_access",
        user_id: userId,
        full_name: confirmation.full_name,
        email,
        token_hash: hashEmailActionToken(passwordSetupToken),
        expires_at: addHours(EVENT_PASSWORD_SETUP_EXPIRATION_HOURS),
        metadata: { source: "event_signup_inline", event_id: eventId },
      });
      if (passwordTokenError) {
        void logSystemError({ source: "api.auth.confirm_registration.event_password_token", error: passwordTokenError, request, metadata: { user_id: userId, event_id: eventId } });
        return NextResponse.json({ ok: false, code: "FIRST_ACCESS_CREATION_FAILED", message: "Sua conta foi criada, mas não foi possível preparar a definição de senha. Abra novamente o link do Evento para continuar." }, { status: 500 });
      }

      const { data: activatedProfile, error: profileError } = await supabase.from("profiles").update({ is_active: true }).eq("id", userId).select("id").maybeSingle();
      if (profileError || !activatedProfile) {
        void logSystemError({ source: "api.auth.confirm_registration.event_profile", error: profileError, request, metadata: { user_id: userId, event_id: eventId } });
        return NextResponse.json({ ok: false, code: "EVENT_PROFILE_ACTIVATION_FAILED", message: "Sua conta foi criada, mas o acesso ao Evento não pôde ser concluído. Abra novamente o link do Evento para continuar." }, { status: 500 });
      }

      const { error: participantError } = await supabase.from("simulado_event_participants").upsert({ event_id: eventId, student_id: userId, source: "registration" }, { onConflict: "event_id,student_id", ignoreDuplicates: true });
      if (participantError) {
        void logSystemError({ source: "api.auth.confirm_registration.event_participant", error: participantError, request, metadata: { user_id: userId, event_id: eventId } });
        return NextResponse.json({ ok: false, code: "EVENT_PARTICIPANT_FAILED", message: "Sua conta foi criada, mas a participação no Evento não pôde ser concluída. Abra novamente o link do Evento para continuar." }, { status: 500 });
      }

      const { data: finalizedConfirmation, error: confirmationUpdateError } = await supabase.from("student_registration_confirmations").update({ user_id: userId }).eq("id", confirmation.id).eq("used_at", claimedAt).select("id").maybeSingle();
      if (confirmationUpdateError || !finalizedConfirmation) {
        void logSystemError({ source: "api.auth.confirm_registration.confirmation", error: confirmationUpdateError, request, metadata: { user_id: userId, event_id: eventId } });
        return NextResponse.json({ ok: false, code: "REGISTRATION_CONFIRMATION_FINALIZE_FAILED", message: "Sua conta foi criada, mas o cadastro não pôde ser finalizado. Abra novamente o link do Evento para continuar." }, { status: 500 });
      }

      const { data: consumedIntent, error: intentError } = await supabase.from("simulado_event_join_intents").update({ consumed_at: new Date().toISOString() }).eq("event_id", eventId).eq("email", email).is("consumed_at", null).select("id").maybeSingle();
      if (intentError || !consumedIntent) {
        void logSystemError({ source: "api.auth.confirm_registration.event_intent", error: intentError, request, metadata: { user_id: userId, event_id: eventId } });
        return NextResponse.json({ ok: false, code: "EVENT_INTENT_CONSUME_FAILED", message: "Sua conta foi criada, mas o ingresso no Evento não pôde ser finalizado. Abra novamente o link do Evento para continuar." }, { status: 500 });
      }

      const response = NextResponse.json({
        ok: true,
        message: "E-mail confirmado. Sua conta está ativa. Defina sua senha para continuar.",
        event_id: eventId,
        password_setup_ready: true,
      });
      response.cookies.set(FIRST_ACCESS_COOKIE, passwordSetupToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: FIRST_ACCESS_COOKIE_PATH, maxAge: EVENT_PASSWORD_SETUP_EXPIRATION_HOURS * 60 * 60 });
      response.cookies.set("estudotop_event_intent", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
      return response;
    }

    const { data: finalizedConfirmation, error: confirmationUpdateError } = await supabase.from("student_registration_confirmations").update({ user_id: userId }).eq("id", confirmation.id).eq("used_at", claimedAt).select("id").maybeSingle();
    if (confirmationUpdateError || !finalizedConfirmation) {
      void logSystemError({ source: "api.auth.confirm_registration.confirmation", error: confirmationUpdateError, request, metadata: { user_id: userId } });
      return NextResponse.json({ ok: false, message: "Não foi possível finalizar o cadastro." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "E-mail confirmado. Seu cadastro foi efetivado e ficará em análise para liberação.",
      event_id: null,
    });
  } catch (error) {
    void logSystemError({ source: "api.auth.confirm_registration", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao confirmar cadastro." }, { status: 500 });
  }
}
