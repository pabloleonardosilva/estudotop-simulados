import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addHours, deriveHotmartFirstAccessToken, hashEmailActionToken } from "@/lib/security/registrationTokens";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

const FROM_EMAIL = "EstudoTOP <estudotop@estudotop.com.br>";
const FIRST_ACCESS_HOURS = 72;
const EMAIL_LEASE_MINUTES = 15;
const MAX_EMAIL_ATTEMPTS = 5;

type FirstAccessTokenState = { used_at: string | null; expires_at: string } | null;

export function resolveHotmartAccessEmailDelivery(mustChangePassword: boolean, tokenState: FirstAccessTokenState, lookupError: unknown = null) {
  if (lookupError) return "lookup_failed" as const;
  if (tokenState?.used_at) return "reconcile_used" as const;
  if (tokenState || mustChangePassword) return "first_access" as const;
  return "login" as const;
}

export function buildHotmartAccessEmailIdentity(appUrl: string, transactionId: string, token: string | null) {
  return {
    ctaUrl: token ? `${appUrl}/primeiro-acesso?token=${token}` : `${appUrl}/login`,
    idempotencyKey: `hotmart-access-${transactionId}`,
    ctaLabel: token ? "Definir minha senha" : "Acessar o EstudoTOP",
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function sendHotmartTransactionEmail(supabase: SupabaseClient, transactionId: string, pending: boolean) {
  const emailType = pending ? "pending" : "access";
  const { data: claimRows, error: claimError } = await supabase.rpc("claim_hotmart_transaction_email", {
    p_transaction_id: transactionId, p_email_type: emailType, p_lease_seconds: 900,
  });
  const claim = claimRows?.[0] as { claimed?: boolean; claimed_at?: string } | undefined;
  if (claimError || !claim?.claimed || !claim.claimed_at) return false;
  const claimedAt = claim.claimed_at;
  const { data: claimed } = await supabase.from("hotmart_transactions")
    .select("id,student_id,buyer_email,buyer_name,product_name_snapshot,destination_type")
    .eq("id", transactionId).maybeSingle();
  if (!claimed) {
    await supabase.rpc("complete_hotmart_transaction_email", { p_transaction_id: transactionId, p_email_type: emailType, p_claimed_at: claimedAt, p_success: false, p_error: "Transação não encontrada após claim." });
    return false;
  }
  try {
    let accessToken: string | null = null;
    let existingToken: FirstAccessTokenState = null;
    if (!pending && claimed.student_id) {
      accessToken = deriveHotmartFirstAccessToken(transactionId, claimed.student_id);
      const tokenHash = hashEmailActionToken(accessToken);
      const { data, error: tokenLookupError } = await supabase.from("student_registration_confirmations")
        .select("id,used_at,expires_at").eq("purpose", "first_access").eq("token_hash", tokenHash)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      existingToken = data;
      const { data: profile, error: profileLookupError } = !tokenLookupError && !existingToken
        ? await supabase.from("profiles").select("must_change_password").eq("id", claimed.student_id).maybeSingle()
        : { data: null, error: null };
      const delivery = resolveHotmartAccessEmailDelivery(Boolean(profile?.must_change_password), existingToken, tokenLookupError);
      if (delivery === "lookup_failed") throw new Error("HOTMART_FIRST_ACCESS_LOOKUP_FAILED");
      if (profileLookupError) throw new Error("HOTMART_PROFILE_LOOKUP_FAILED");
      if (delivery === "reconcile_used") {
        const { data: completed } = await supabase.rpc("complete_hotmart_transaction_email", {
          p_transaction_id: transactionId, p_email_type: emailType, p_claimed_at: claimedAt, p_success: true, p_error: null,
        });
        return Boolean(completed);
      }
      if (delivery === "first_access" && existingToken && existingToken.expires_at <= new Date().toISOString()) {
        const { error: tokenError } = await supabase.from("student_registration_confirmations")
          .update({ expires_at: addHours(FIRST_ACCESS_HOURS) }).eq("token_hash", tokenHash).eq("purpose", "first_access").is("used_at", null);
        if (tokenError) throw tokenError;
      } else if (delivery === "first_access" && !existingToken) {
        const { error: tokenError } = await supabase.from("student_registration_confirmations").insert({
          purpose: "first_access", user_id: claimed.student_id, full_name: claimed.buyer_name || claimed.buyer_email,
          email: claimed.buyer_email, token_hash: tokenHash, desired_status: "active",
          expires_at: addHours(FIRST_ACCESS_HOURS), metadata: { source: "hotmart", transaction_id: transactionId },
        });
        if (tokenError) throw tokenError;
      }
      if (delivery === "login") accessToken = null;
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY_NOT_CONFIGURED");
    const appUrl = getPublicAppUrl();
    const accessIdentity = buildHotmartAccessEmailIdentity(appUrl, transactionId, accessToken);
    const ctaUrl = pending ? `${appUrl}/login` : accessIdentity.ctaUrl;
    const title = pending ? "Recebemos sua compra" : "Seu acesso EstudoTOP está disponível";
    const message = pending
      ? "Recebemos sua compra pela Hotmart e estamos concluindo a liberação. Esta mensagem não confirma que o acesso já foi concedido."
      : `Sua compra de ${claimed.product_name_snapshot} foi processada pela Hotmart. O acesso educacional acontece pelo EstudoTOP Simulados, e não pela área da Hotmart.`;
    const safeTitle = escapeHtml(title);
    const safeName = escapeHtml(claimed.buyer_name || "aluno");
    const safeMessage = escapeHtml(message);
    const { error } = await new Resend(resendKey).emails.send({
      from: FROM_EMAIL, to: claimed.buyer_email, subject: title,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>${safeTitle}</h1><p>Olá, ${safeName}.</p><p>${safeMessage}</p><p><a href="${ctaUrl}">${pending ? "Acompanhar no EstudoTOP" : accessIdentity.ctaLabel}</a></p><p>Nos próximos acessos, utilize sempre o EstudoTOP.</p></div>`,
      text: `${title}\n\n${message}\n\n${ctaUrl}\n\nNos próximos acessos, utilize sempre o EstudoTOP.`,
    }, { idempotencyKey: pending ? `hotmart-pending-${transactionId}` : accessIdentity.idempotencyKey });
    if (error) throw error;
    const { data: completed, error: completeError } = await supabase.rpc("complete_hotmart_transaction_email", {
      p_transaction_id: transactionId, p_email_type: emailType, p_claimed_at: claimedAt, p_success: true, p_error: null,
    });
    if (completeError || !completed) throw completeError || new Error("HOTMART_EMAIL_CLAIM_EXPIRED");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha no envio.";
    await supabase.rpc("complete_hotmart_transaction_email", {
      p_transaction_id: transactionId, p_email_type: emailType, p_claimed_at: claimedAt, p_success: false, p_error: message,
    });
    return false;
  }
}

export async function recoverHotmartTransactionEmails(supabase: SupabaseClient, requestedLimit = 20) {
  const limit = Math.max(1, Math.min(requestedLimit, 50));
  const staleBefore = new Date(Date.now() - EMAIL_LEASE_MINUTES * 60_000).toISOString();
  const fields = "id,processing_status,access_email_sent_at,access_email_claimed_at,access_email_attempt_count,pending_email_sent_at,pending_email_claimed_at,pending_email_attempt_count";
  const [processedResult, pendingResult] = await Promise.all([
    supabase.from("hotmart_transactions").select(fields).eq("processing_status", "processed").is("access_email_sent_at", null).order("created_at", { ascending: true }).limit(limit),
    supabase.from("hotmart_transactions").select(fields).like("processing_status", "pending%").is("pending_email_sent_at", null).order("created_at", { ascending: true }).limit(limit),
  ]);
  if (processedResult.error || pendingResult.error) throw processedResult.error || pendingResult.error;
  const data = [...(processedResult.data || []), ...(pendingResult.data || [])];
  let recovered = 0;
  let attempted = 0;
  for (const transaction of data || []) {
    if (attempted >= limit) break;
    const pending = transaction.processing_status.startsWith("pending");
    const sentAt = pending ? transaction.pending_email_sent_at : transaction.access_email_sent_at;
    const claimedAt = pending ? transaction.pending_email_claimed_at : transaction.access_email_claimed_at;
    const attempts = pending ? transaction.pending_email_attempt_count : transaction.access_email_attempt_count;
    if (sentAt || attempts >= MAX_EMAIL_ATTEMPTS || (claimedAt && claimedAt >= staleBefore)) continue;
    attempted += 1;
    if (await sendHotmartTransactionEmail(supabase, transaction.id, pending)) recovered += 1;
  }
  return { inspected: data?.length || 0, attempted, recovered, limit };
}
