import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { getApprovedStudentForPasswordRecovery } from "@/lib/server/passwordRecoveryEligibility";
import { generateSecureToken, hashEmailActionToken, hashPasswordRecoveryFingerprint } from "@/lib/security/registrationTokens";
import { sendPasswordRecoveryEmail } from "@/app/lib/server/sendPasswordRecoveryEmail";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";

const PUBLIC_MESSAGE = "Se este e-mail pertencer a uma conta ativa, você receberá um link para redefinir sua senha. Confira também sua caixa de spam.";
const RECOVERY_EXPIRATION_MINUTES = 30;

function normalizedRequestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || "unknown"
  ).trim().toLowerCase().slice(0, 128);
}

export async function POST(request: Request) {
  try {
    const { email: rawEmail } = (await request.json()) as { email?: string };
    const email = rawEmail?.trim().toLowerCase() || "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, code: "EMAIL_INVALID", message: "Informe um e-mail válido.", field: "email" }, { status: 400 });
    }

    void logSecurityEvent({ event: "password_recovery_requested", actorType: "system", severity: "info" });

    const supabase = createSupabaseAdminClient();
    const student = await getApprovedStudentForPasswordRecovery(supabase, { email });
    const { data: professor } = student ? { data: null } : await supabase.from("professors").select("id,email,status").eq("email", email).eq("status", "active").maybeSingle();
    if (professor) {
      const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", professor.id).maybeSingle();
      if (profile?.role !== "professor" || !profile.is_active) return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }
    const account = student || professor;
    if (!account) return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });

    void logSecurityEvent({
      event: "password_recovery_eligible",
      actorType: student ? "student" : "professor",
      actorId: account.id,
      severity: "info",
    });

    const token = generateSecureToken();
    const tokenHash = hashEmailActionToken(token);
    const fingerprintHash = hashPasswordRecoveryFingerprint(email, normalizedRequestIp(request));
    const expiresAt = new Date(Date.now() + RECOVERY_EXPIRATION_MINUTES * 60_000).toISOString();
    const { data: createRows, error: createError } = await supabase.rpc("create_password_recovery_request", {
      p_user_id: account.id,
      p_token_hash: tokenHash,
      p_request_fingerprint_hash: fingerprintHash,
      p_expires_at: expiresAt,
    });

    if (createError) {
      void logSystemError({ source: "api.auth.forgot_password.create_request", error: new Error(createError.message), request, metadata: { user_id: account.id } });
      return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }

    const creation = Array.isArray(createRows) ? createRows[0] : createRows;
    const requestId = typeof creation?.request_id === "string" ? creation.request_id : null;
    const outcome = typeof creation?.outcome === "string" ? creation.outcome : "unknown";
    if (!requestId || outcome !== "created") {
      void logSecurityEvent({
        event: "password_recovery_rate_limited",
        actorType: student ? "student" : "professor",
        actorId: account.id,
        severity: "warning",
        metadata: { outcome },
      });
      return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }

    try {
      const recoveryUrl = `${getPublicAppUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
      const delivery = await sendPasswordRecoveryEmail({
        recipientEmail: account.email,
        recoveryUrl,
        expiresInMinutes: RECOVERY_EXPIRATION_MINUTES,
      });
      const { data: markedSent, error: markSentError } = await supabase.rpc("mark_password_recovery_email_sent", { p_request_id: requestId });
      if (markSentError || markedSent !== true) {
        await supabase.rpc("fail_password_recovery_request", { p_request_id: requestId });
        void logSystemError({
          source: "api.auth.forgot_password.mark_sent",
          error: new Error(markSentError?.message || "PASSWORD_RECOVERY_EMAIL_SENT_STATE_NOT_PERSISTED"),
          request,
          severity: "critical",
          metadata: { request_id: requestId, user_id: account.id, provider_message_id: delivery.providerMessageId },
        });
        return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
      }

      void logSecurityEvent({
        event: "password_recovery_email_sent",
        actorType: student ? "student" : "professor",
        actorId: account.id,
        resourceType: "password_recovery_request",
        resourceId: requestId,
        severity: "info",
        metadata: { provider_message_id: delivery.providerMessageId },
      });
    } catch (emailError) {
      const { error: failRequestError } = await supabase.rpc("fail_password_recovery_request", { p_request_id: requestId });
      if (failRequestError) {
        void logSystemError({ source: "api.auth.forgot_password.fail_request", error: new Error(failRequestError.message), request, severity: "critical", metadata: { request_id: requestId, user_id: account.id } });
      }
      void logSystemError({ source: "api.auth.forgot_password.email", error: emailError, request, metadata: { request_id: requestId, user_id: account.id } });
      void logSecurityEvent({
        event: "password_recovery_email_failed",
        actorType: student ? "student" : "professor",
        actorId: account.id,
        resourceType: "password_recovery_request",
        resourceId: requestId,
        severity: "error",
      });
    }

    return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
  } catch (error) {
    void logSystemError({ source: "api.auth.forgot_password", error, request });
    return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
  }
}
