import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { passwordPolicyError } from "@/lib/auth/passwordPolicy";
import { getPasswordPolicyContext } from "@/lib/server/passwordPolicyContext";
import { logPasswordActivity } from "@/app/lib/server/studentActivityLog";
import { logSecurityEvent, logSystemError } from "@/app/lib/server/auditLogger";
import { getApprovedStudentForPasswordRecovery } from "@/lib/server/passwordRecoveryEligibility";
import { hashEmailActionToken } from "@/lib/security/registrationTokens";

type ResetPasswordPayload = { password?: string; confirmPassword?: string; token?: string };

const INVALID_RECOVERY_LINK = "Este link é inválido ou expirou. Solicite uma nova redefinição de senha.";

async function resetWithPrivateToken(request: Request, payload: ResetPasswordPayload) {
  const token = payload.token?.trim() || "";
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    void logSecurityEvent({ event: "password_recovery_invalid_token", actorType: "system", severity: "warning" });
    return NextResponse.json({ ok: false, code: "PASSWORD_TOKEN_INVALID", message: INVALID_RECOVERY_LINK }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const tokenHash = hashEmailActionToken(token);
  const { data: recovery, error: recoveryError } = await supabase
    .from("password_recovery_requests")
    .select("id,user_id")
    .eq("token_hash", tokenHash)
    .eq("status", "pending")
    .not("email_sent_at", "is", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (recoveryError) {
    void logSystemError({ source: "api.auth.reset_password.lookup", error: new Error(recoveryError.message), request });
    return NextResponse.json({ ok: false, code: "PASSWORD_RECOVERY_UNAVAILABLE", message: "Não foi possível validar o link agora. Tente novamente." }, { status: 503 });
  }
  if (!recovery?.user_id) {
    void logSecurityEvent({ event: "password_recovery_invalid_token", actorType: "system", severity: "warning" });
    return NextResponse.json({ ok: false, code: "PASSWORD_TOKEN_INVALID", message: INVALID_RECOVERY_LINK }, { status: 400 });
  }

  const approvedStudent = await getApprovedStudentForPasswordRecovery(supabase, { userId: recovery.user_id });
  const { data: professor } = approvedStudent
    ? { data: null }
    : await supabase.from("professors").select("id,status").eq("id", recovery.user_id).eq("status", "active").maybeSingle();
  const { data: professorProfile } = professor
    ? await supabase.from("profiles").select("role,is_active").eq("id", professor.id).maybeSingle()
    : { data: null };
  const validProfessor = Boolean(professor && professorProfile?.role === "professor" && professorProfile.is_active);
  if (!approvedStudent && !validProfessor) {
    void logSecurityEvent({
      event: "password_recovery_invalid_token",
      actorType: "system",
      actorId: recovery.user_id,
      severity: "warning",
      metadata: { reason: "account_ineligible" },
    });
    return NextResponse.json({ ok: false, code: "PASSWORD_TOKEN_INVALID", message: INVALID_RECOVERY_LINK }, { status: 400 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(recovery.user_id);
  const context = await getPasswordPolicyContext(supabase, recovery.user_id, authUser.user?.email);
  const policyError = passwordPolicyError(payload.password || "", payload.confirmPassword, context);
  if (policyError) {
    return NextResponse.json({ ok: false, ...policyError, field: "password" }, { status: 400 });
  }

  const claimId = crypto.randomUUID();
  const { data: claimRows, error: claimError } = await supabase.rpc("claim_password_recovery_request", {
    p_token_hash: tokenHash,
    p_claim_id: claimId,
  });
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (claimError) {
    void logSystemError({ source: "api.auth.reset_password.claim", error: new Error(claimError.message), request, metadata: { request_id: recovery.id, user_id: recovery.user_id } });
    return NextResponse.json({ ok: false, code: "PASSWORD_RECOVERY_UNAVAILABLE", message: "Não foi possível validar o link agora. Tente novamente." }, { status: 503 });
  }
  if (claim?.request_id !== recovery.id || claim?.user_id !== recovery.user_id) {
    void logSecurityEvent({ event: "password_recovery_invalid_token", actorType: "system", severity: "warning" });
    return NextResponse.json({ ok: false, code: "PASSWORD_TOKEN_INVALID", message: INVALID_RECOVERY_LINK }, { status: 400 });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(recovery.user_id, { password: payload.password });
  if (updateError) {
    const { error: releaseError } = await supabase.rpc("release_password_recovery_claim", { p_request_id: recovery.id, p_claim_id: claimId });
    if (releaseError) {
      void logSystemError({ source: "api.auth.reset_password.release", error: new Error(releaseError.message), request, severity: "critical", metadata: { request_id: recovery.id, user_id: recovery.user_id } });
    }
    void logSystemError({
      source: "api.auth.reset_password.auth",
      error: new Error(`SUPABASE_AUTH_PASSWORD_UPDATE_FAILED:${updateError.code || updateError.status || "unknown"}`),
      request,
      metadata: { request_id: recovery.id, user_id: recovery.user_id },
    });
    return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_FAILED", message: "Não foi possível atualizar sua senha. Tente novamente." }, { status: 400 });
  }

  const { data: completed, error: completeError } = await supabase.rpc("complete_password_recovery_request", {
    p_request_id: recovery.id,
    p_claim_id: claimId,
  });
  if (completeError || completed !== true) {
    void logSystemError({
      source: "api.auth.reset_password.complete",
      error: new Error(completeError?.message || "PASSWORD_RECOVERY_COMPLETION_NOT_PERSISTED"),
      request,
      severity: "critical",
      metadata: { request_id: recovery.id, user_id: recovery.user_id, auth_password_updated: true },
    });
  }

  if (approvedStudent) {
    await logPasswordActivity({
      supabase,
      studentId: approvedStudent.id,
      eventType: "password_reset",
      description: "Senha redefinida pelo aluno",
      performedByName: "Aluno",
      details: { source: "private_recovery_token", changed_by: "student" },
    });
  }
  void logSecurityEvent({
    event: "password_recovery_completed",
    actorType: approvedStudent ? "student" : "professor",
    actorId: recovery.user_id,
    resourceType: "password_recovery_request",
    resourceId: recovery.id,
    severity: completeError || completed !== true ? "critical" : "info",
    metadata: { completion_persisted: !completeError && completed === true },
  });

  return NextResponse.json({ ok: true, message: "Senha alterada com sucesso." });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ResetPasswordPayload;
    if (payload.token) return resetWithPrivateToken(request, payload);

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return NextResponse.json({ ok: false, code: "PASSWORD_SESSION_INVALID", message: "Sua sessão de alteração de senha expirou. Solicite um novo acesso." }, { status: 401 });

    const { password, confirmPassword } = payload;
    const supabase = createSupabaseAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ ok: false, code: "PASSWORD_SESSION_INVALID", message: "Sua sessão de alteração de senha expirou. Solicite um novo acesso." }, { status: 401 });

    const approvedStudent = await getApprovedStudentForPasswordRecovery(supabase, { userId: userData.user.id });
    const { data: professor } = approvedStudent ? { data: null } : await supabase.from("professors").select("id,status").eq("id", userData.user.id).eq("status", "active").maybeSingle();
    const { data: professorProfile } = professor ? await supabase.from("profiles").select("role,is_active").eq("id", professor.id).maybeSingle() : { data: null };
    const validProfessor = Boolean(professor && professorProfile?.role === "professor" && professorProfile.is_active);
    if (!approvedStudent && !validProfessor) return NextResponse.json({ ok: false, code: "PASSWORD_RECOVERY_NOT_ALLOWED", message: "A recuperação de senha não está disponível para esta conta." }, { status: 403 });

    const context = await getPasswordPolicyContext(supabase, userData.user.id, userData.user.email);
    const policyError = passwordPolicyError(password || "", confirmPassword, context);
    if (policyError) return NextResponse.json({ ok: false, ...policyError, field: "password" }, { status: 400 });

    const { error: updateError } = await supabase.auth.admin.updateUserById(userData.user.id, { password });
    if (updateError) {
      void logSystemError({ source: "api.auth.reset_password", error: updateError, request });
      return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_FAILED", message: "Não foi possível atualizar sua senha. Tente novamente." }, { status: 400 });
    }

    if (approvedStudent) await logPasswordActivity({ supabase, studentId: approvedStudent.id, eventType: "password_reset", description: "Senha redefinida pelo aluno", performedByName: "Aluno", details: { source: "recovery_session", changed_by: "student" } });

    return NextResponse.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.auth.reset_password", error, request });
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "Ocorreu um erro interno ao atualizar a senha." }, { status: 500 });
  }
}
