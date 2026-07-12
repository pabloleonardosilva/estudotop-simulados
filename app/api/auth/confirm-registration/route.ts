import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { authUserExists, findAuthUserByEmail, reconcileIncompleteStudentAccount } from "@/lib/server/studentAccountRepair";

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
      return NextResponse.json({ ok: false, message: "Código inválido." }, { status: 400 });
    }

    const { data: existingStudent } = await supabase
      .from("students")
      .select("id, email, cpf")
      .or(confirmation.cpf ? `email.eq.${email},cpf.eq.${confirmation.cpf}` : `email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existingStudent) {
      await supabase
        .from("student_registration_confirmations")
        .update({ used_at: new Date().toISOString() })
        .eq("id", confirmation.id);

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

    const temporaryPassword = generateTemporaryPassword();

    // Cenário C — conta incompleta (Auth e/ou profile sem students): reconcilia
    // reutilizando o mesmo UUID, sem criar um segundo usuário.
    const orphanAuthUser = await findAuthUserByEmail(supabase, email);
    if (orphanAuthUser) {
      const repair = await reconcileIncompleteStudentAccount({
        supabase,
        authUser: orphanAuthUser,
        fullName: confirmation.full_name,
        email,
        cpf: confirmation.cpf || null,
        phone: confirmation.phone || null,
        desiredContests: confirmation.desired_contests || null,
        extraStudentFields: { email_confirmed_at: new Date().toISOString() },
        temporaryPassword,
        studentStatus: "pending",
      });

      if (!repair.ok) {
        void logSystemError({
          source: "api.auth.confirm_registration.reconcile",
          error: new Error(`${repair.code}: ${repair.message} (user ${orphanAuthUser.id})`),
          request,
        });
        return NextResponse.json(
          {
            ok: false,
            message: repair.code === "NOT_STUDENT_ACCOUNT"
              ? "Este e-mail não pode ser usado para cadastro de aluno."
              : "Não foi possível concluir o cadastro.",
          },
          { status: repair.code === "NOT_STUDENT_ACCOUNT" ? 409 : 400 }
        );
      }

      await supabase
        .from("student_registration_confirmations")
        .update({ used_at: new Date().toISOString(), user_id: repair.userId })
        .eq("id", confirmation.id);

      return NextResponse.json({
        ok: true,
        message: "E-mail confirmado. Seu cadastro foi efetivado e ficará em análise para liberação.",
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: confirmation.full_name },
    });

    if (authError || !authData.user) {
      void logSystemError({ source: "api.auth.confirm_registration", error: authError || new Error("createUser sem usuário"), request });
      const alreadyRegistered = authError?.message?.includes("already been registered");
      return NextResponse.json(
        { ok: false, message: alreadyRegistered ? "Este e-mail já está cadastrado." : "Não foi possível concluir o cadastro." },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      full_name: confirmation.full_name,
      role: "student",
      is_active: false,
      must_change_password: true,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      void logSystemError({ source: "api.auth.confirm_registration", error: profileError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível concluir o cadastro." }, { status: 400 });
    }

    const { error: studentError } = await supabase.from("students").insert({
      id: userId,
      name: confirmation.full_name,
      email,
      cpf: confirmation.cpf || null,
      phone: confirmation.phone || null,
      status: "pending",
      desired_contests: confirmation.desired_contests || null,
      email_confirmed_at: new Date().toISOString(),
    });

    if (studentError) {
      await supabase.from("profiles").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
      void logSystemError({ source: "api.auth.confirm_registration", error: studentError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível concluir o cadastro." }, { status: 400 });
    }

    await supabase
      .from("student_registration_confirmations")
      .update({ used_at: new Date().toISOString(), user_id: userId })
      .eq("id", confirmation.id);

    return NextResponse.json({
      ok: true,
      message: "E-mail confirmado. Seu cadastro foi efetivado e ficará em análise para liberação.",
    });
  } catch (error) {
    void logSystemError({ source: "api.auth.confirm_registration", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao confirmar cadastro." }, { status: 500 });
  }
}
