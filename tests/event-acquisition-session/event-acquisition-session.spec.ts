import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("AppShell never redirects an existing session away from the event/cadastro acquisition routes", () => {
  const appShell = read("app/components/AppShell.tsx");
  expect(appShell).toContain(
    'const isEventAcquisitionRoute = pathname === "/cadastro" || pathname.startsWith("/cadastro/confirmar") || pathname.startsWith("/evento/");',
  );
  // A sessão de "must_change_password" não pode sequestrar o link de continuação.
  expect(appShell).toContain("if (user && profile?.must_change_password && !isChangePasswordRoute && !isEventAcquisitionRoute) {");
  // O redirect de rota pública autenticada (para a home do papel do usuário) também não pode.
  expect(appShell).toContain("if (user && profile && isPublicRoute && !isEventAcquisitionRoute) {");
  // Os guards mais específicos de aluno e professor também precisam da mesma exceção.
  expect(appShell).toContain("!isAllowedStudentRoute && !isEventAcquisitionRoute) {");
  expect(appShell).toContain('!pathname.startsWith("/professor") && !isEventAcquisitionRoute) {');
  // A tela de loading que aguarda studentNavAccess não pode bloquear essas rotas.
  expect(appShell).toContain("isPublicRoute && !isEventAcquisitionRoute && !studentNavAccess");
});

test("event confirmation exposes the securely validated intent email instead of trusting client input", () => {
  const confirmRoute = read("app/api/events/[slug]/confirm/route.ts");
  // CASO A: sem student, segue para /cadastro com o e-mail da intenção (nunca do body).
  expect(confirmRoute).toContain(
    "let next = `/cadastro?event=${encodeURIComponent(slug)}&email=${encodeURIComponent(intent.email)}`;",
  );
  expect(confirmRoute).toContain("email: intent.email");
  expect(confirmRoute).not.toContain("consumed_at: new Date()");
  // Esta rota nunca mexe em participante — evita duplicar o upsert que já
  // ocorre em confirm-registration na primeira conclusão bem-sucedida.
  expect(confirmRoute).not.toContain("simulado_event_participants");
});

test("existence in students alone never decides /login — must_change_password does", () => {
  const confirmRoute = read("app/api/events/[slug]/confirm/route.ts");

  const profileSelectIndex = confirmRoute.indexOf('supabase.from("profiles").select("role,must_change_password")');
  const casoBIndex = confirmRoute.indexOf('profile.must_change_password === false');
  const loginAssignIndex = confirmRoute.indexOf('next = `/login?event=${encodeURIComponent(slug)}`;', casoBIndex);
  expect(profileSelectIndex).toBeGreaterThan(-1);
  expect(casoBIndex).toBeGreaterThan(profileSelectIndex);
  expect(loginAssignIndex).toBeGreaterThan(casoBIndex);

  // CASO C: must_change_password=true nunca vai para /login.
  const casoCIndex = confirmRoute.indexOf("profile.must_change_password === true");
  expect(casoCIndex).toBeGreaterThan(casoBIndex);
  const casoCBlock = confirmRoute.slice(casoCIndex, confirmRoute.indexOf("} else {", casoCIndex));
  expect(casoCBlock).not.toContain("/login");
});

test("caso C issues a brand new first_access token, invalidating any pending one first, without ever reusing raw tokens", () => {
  const confirmRoute = read("app/api/events/[slug]/confirm/route.ts");

  const casoCIndex = confirmRoute.indexOf("profile.must_change_password === true");
  const invalidateIndex = confirmRoute.indexOf('.eq("purpose", "first_access")', casoCIndex);
  const newTokenIndex = confirmRoute.indexOf("const newToken = generateSecureToken();", invalidateIndex);
  const insertIndex = confirmRoute.indexOf('purpose: "first_access"', newTokenIndex);
  const hashIndex = confirmRoute.indexOf("token_hash: hashEmailActionToken(newToken)", insertIndex);
  const primeiroAcessoIndex = confirmRoute.indexOf("next = `/primeiro-acesso?token=${encodeURIComponent(newToken)}`;", hashIndex);

  // Ordem: invalida o pendente ANTES de gerar/gravar o novo — nunca dois
  // first_access válidos ao mesmo tempo.
  expect(invalidateIndex).toBeGreaterThan(casoCIndex);
  expect(newTokenIndex).toBeGreaterThan(invalidateIndex);
  expect(insertIndex).toBeGreaterThan(newTokenIndex);
  expect(hashIndex).toBeGreaterThan(insertIndex);
  expect(primeiroAcessoIndex).toBeGreaterThan(hashIndex);

  // Só o hash do novo token é persistido — o valor bruto nunca é gravado em
  // nenhuma coluna, só usado para computar o hash e compor a URL de resposta.
  expect(confirmRoute).not.toMatch(/token:\s*newToken[^_]/);
  expect(confirmRoute).not.toContain("raw_token");

  // O token do link JÁ VALIDADO (da intenção do Evento) nunca é reaproveitado
  // como first_access — usamos sempre newToken, nunca `token` (o do confirm).
  expect(confirmRoute).not.toContain("token_hash: hashEmailActionToken(token)");
});

test("caso D falls back to password recovery only when resuming first_access is not safe", () => {
  const confirmRoute = read("app/api/events/[slug]/confirm/route.ts");

  const invalidateErrorIndex = confirmRoute.indexOf("if (invalidateError) {");
  const insertErrorIndex = confirmRoute.indexOf("if (insertError) {");
  const inconsistentElseIndex = confirmRoute.indexOf("// CASO D: students existe");

  expect(invalidateErrorIndex).toBeGreaterThan(-1);
  expect(insertErrorIndex).toBeGreaterThan(invalidateErrorIndex);
  expect(inconsistentElseIndex).toBeGreaterThan(insertErrorIndex);

  const recoveryFallbackCount = (confirmRoute.match(/next = `\/esqueci-senha\?email=\$\{encodeURIComponent\(intent\.email\)\}`;/g) || []).length;
  // As três origens de CASO D (falha ao invalidar, falha ao inserir, profile
  // inconsistente) caem todas no mesmo fallback seguro.
  expect(recoveryFallbackCount).toBe(3);
});

test("event page compares the server-validated intent email against any active session before navigating", () => {
  const page = read("app/evento/[slug]/page-client.tsx");
  const confirmIndex = page.indexOf("fetch(`/api/events/${slug}/confirm`");
  const sessionCheckIndex = page.indexOf("supabase.auth.getSession()", confirmIndex);
  const intentEmailIndex = page.indexOf("json.email", sessionCheckIndex);
  const compareIndex = page.indexOf("sessionEmail !== intentEmail", intentEmailIndex);
  const replaceIndex = page.indexOf("router.replace(json.next)", compareIndex);

  expect(confirmIndex).toBeGreaterThan(-1);
  expect(sessionCheckIndex).toBeGreaterThan(confirmIndex);
  expect(intentEmailIndex).toBeGreaterThan(sessionCheckIndex);
  expect(compareIndex).toBeGreaterThan(intentEmailIndex);
  expect(replaceIndex).toBeGreaterThan(compareIndex);
  // A query string (?email=) nunca é usada como identidade nesta comparação.
  expect(page.slice(confirmIndex, replaceIndex)).not.toContain('query.get("email")');
});

test("a validated session conflict signs out automatically before continuing", () => {
  const page = read("app/evento/[slug]/page-client.tsx");
  expect(page).not.toContain("setSessionConflict");
  expect(page).not.toContain("Sair e continuar cadastro");

  const compareIndex = page.indexOf("sessionEmail !== intentEmail");
  const signOutIndex = page.indexOf("await supabase.auth.signOut()", compareIndex);
  const nextReplaceIndex = page.indexOf("router.replace(json.next)", signOutIndex);
  expect(compareIndex).toBeGreaterThan(-1);
  expect(signOutIndex).toBeGreaterThan(compareIndex);
  expect(nextReplaceIndex).toBeGreaterThan(signOutIndex);

  // O logout só aparece depois da resposta segura de /confirm e da comparação.
  expect(page.indexOf("fetch(`/api/events/${slug}/confirm`")).toBeLessThan(signOutIndex);
});

test("public registration never inspects the event intent cookie for a submission that doesn't declare an event (CASO 1/2/3)", () => {
  const registerRoute = read("app/api/auth/register/route.ts");

  const eventSlugIndex = registerRoute.indexOf('const eventSlug = typeof body.event === "string" ? body.event.trim() : "";');
  const gateIndex = registerRoute.indexOf("if (eventSlug) {", eventSlugIndex);
  const cookiesCallIndex = registerRoute.indexOf("await cookies();", gateIndex);
  const duplicateCheckIndex = registerRoute.indexOf('supabase.from("students").select("id, email, cpf")');

  expect(eventSlugIndex).toBeGreaterThan(-1);
  // O gate inteiro (incluindo a leitura do cookie) só existe DENTRO do "if
  // (eventSlug)" — cadastro comum (eventSlug vazio) nunca lê o cookie
  // estudotop_event_intent, então um cookie residual de um teste/Evento
  // anterior não é sequer consultado, muito menos aplicado (CASO 1: sem
  // cookie; CASO 2: cookie inválido/expirado; CASO 3: cookie residual
  // válido de outro Evento — os três caem no mesmo caminho "cadastro
  // comum" porque eventSlug está vazio).
  expect(gateIndex).toBeGreaterThan(eventSlugIndex);
  expect(cookiesCallIndex).toBeGreaterThan(gateIndex);
  expect(duplicateCheckIndex).toBeGreaterThan(cookiesCallIndex);
  // Só existe uma chamada a cookies() no arquivo inteiro, e ela está
  // condicionada ao contexto declarado.
  expect((registerRoute.match(/await cookies\(\);/g) || []).length).toBe(1);
});

test("declared event context (CASO 4/5/6/7) requires the intent to match both the exact event and the exact email before linking", () => {
  const registerRoute = read("app/api/auth/register/route.ts");

  const gateIndex = registerRoute.indexOf("if (eventSlug) {");
  const intentSelectIndex = registerRoute.indexOf('supabase.from("simulado_event_join_intents")', gateIndex);
  const eventSlugCompareIndex = registerRoute.indexOf("event.public_slug !== eventSlug", intentSelectIndex);
  const invalidContextReturnIndex = registerRoute.indexOf("EVENT_CONTEXT_INVALID_MESSAGE", eventSlugCompareIndex);
  const emailNormalizationIndex = registerRoute.indexOf("const email = body.email?.trim().toLowerCase();");
  const mismatchCheckIndex = registerRoute.indexOf("intent.email.trim().toLowerCase() !== email", invalidContextReturnIndex);
  const mismatchReturnIndex = registerRoute.indexOf("EVENT_CONTEXT_INVALID_MESSAGE", mismatchCheckIndex);
  const eventIdAssignIndex = registerRoute.indexOf("eventId = intent.event_id;");
  const duplicateCheckIndex = registerRoute.indexOf('supabase.from("students").select("id, email, cpf")');
  const codeGenerationIndex = registerRoute.indexOf("generateNumericCode(6)");
  const confirmationInsertIndex = registerRoute.indexOf('supabase.from("student_registration_confirmations").insert(');
  const resendCallIndex = registerRoute.indexOf("resend.emails.send(");

  // CASO 5/6: sem intent válida, ou intent de um Evento diferente do
  // declarado pela página → bloqueia (mesmo fallback genérico), antes de
  // qualquer coisa relacionada a e-mail/duplicidade/Resend.
  expect(intentSelectIndex).toBeGreaterThan(gateIndex);
  expect(eventSlugCompareIndex).toBeGreaterThan(intentSelectIndex);
  expect(invalidContextReturnIndex).toBeGreaterThan(eventSlugCompareIndex);

  // CASO 7: mesmo Evento, mas e-mail da intenção diferente do body → bloqueia
  // antes de qualquer efeito colateral (item 9: normalização
  // trim().toLowerCase() nos dois lados, igual ao body já normalizado no
  // topo do arquivo).
  expect(emailNormalizationIndex).toBeGreaterThan(-1);
  expect(mismatchCheckIndex).toBeGreaterThan(invalidContextReturnIndex);
  expect(mismatchReturnIndex).toBeGreaterThan(mismatchCheckIndex);

  expect(eventIdAssignIndex).toBeGreaterThan(mismatchReturnIndex);
  expect(duplicateCheckIndex).toBeGreaterThan(eventIdAssignIndex);
  expect(codeGenerationIndex).toBeGreaterThan(eventIdAssignIndex);
  expect(confirmationInsertIndex).toBeGreaterThan(eventIdAssignIndex);
  expect(resendCallIndex).toBeGreaterThan(eventIdAssignIndex);

  // A intenção nunca é marcada como consumida por esta rota, em nenhum
  // caso — consumo continua sendo responsabilidade exclusiva de
  // /api/auth/confirm-registration, após o código ser confirmado.
  expect(registerRoute).not.toContain('simulado_event_join_intents").update({ consumed_at');

  // Contexto declarado sem intent válida, intent de outro Evento e
  // mismatch de e-mail usam todos a mesma mensagem genérica (não revela
  // qual verificação falhou nem a quem o link pertence — item 6).
  const genericMessageCount = (registerRoute.match(/message: EVENT_CONTEXT_INVALID_MESSAGE/g) || []).length;
  expect(genericMessageCount).toBe(2);
  expect(registerRoute).toContain('const EVENT_CONTEXT_INVALID_MESSAGE = "Não foi possível iniciar o cadastro.";');
});

test("regular /cadastro flow outside of an Evento link stays untouched, and only declares event context when ?event= is present (CASO 8: casing)", () => {
  const cadastroPage = read("app/cadastro/page.tsx");
  expect(cadastroPage).toContain('setEventSignup(Boolean(eventParam))');
  expect(cadastroPage).toContain('setEventSlug(eventParam)');
  expect(cadastroPage).toContain('fetch("/api/auth/register"');
  // O campo event só é incluído no corpo do POST quando a página realmente
  // tem um Evento declarado — cadastro comum nunca o envia.
  expect(cadastroPage).toContain('...(eventSlug ? { event: eventSlug } : {})');

  const registerRoute = read("app/api/auth/register/route.ts");
  expect(registerRoute).toContain("RECAPTCHA_ACTION, { minScore: 0.3 }");
  // Comparação de e-mail é case-insensitive dos dois lados (CASO 8: só
  // diferença de casing entre intent.email e body.email deve ser aceita).
  expect(registerRoute).toContain("intent.email.trim().toLowerCase() !== email");
});

test("event inline first access uses a scoped HttpOnly cookie and survives a cadastro remount", () => {
  const confirmRegistration = read("app/api/auth/confirm-registration/route.ts");
  const firstAccess = read("app/api/auth/first-access/route.ts");
  const cadastro = read("app/cadastro/page.tsx");
  expect(confirmRegistration).toContain("response.cookies.set(FIRST_ACCESS_COOKIE, passwordSetupToken");
  expect(confirmRegistration).toContain('httpOnly: true, sameSite: "lax"');
  expect(confirmRegistration).not.toContain("password_setup_token:");
  expect(firstAccess).toContain("export async function GET()");
  expect(firstAccess).toContain("cookieStore.get(FIRST_ACCESS_COOKIE)?.value");
  expect(cadastro).toContain('fetch("/api/auth/first-access", { cache: "no-store" })');
  expect(cadastro).not.toContain("setPasswordSetupToken");
  expect(cadastro).not.toContain("localStorage");
});

test("confirm-registration claims the code and never succeeds when first-access creation fails", () => {
  const route = read("app/api/auth/confirm-registration/route.ts");
  const claimIndex = route.indexOf(".update({ used_at: claimedAt })");
  const accountIndex = route.indexOf("createStudentAccount", claimIndex);
  const tokenIndex = route.indexOf('purpose: "first_access"', accountIndex);
  const participantIndex = route.indexOf('from("simulado_event_participants").upsert', tokenIndex);
  const intentIndex = route.indexOf('from("simulado_event_join_intents").update({ consumed_at', participantIndex);
  expect(claimIndex).toBeGreaterThan(-1);
  expect(accountIndex).toBeGreaterThan(claimIndex);
  expect(tokenIndex).toBeGreaterThan(accountIndex);
  expect(participantIndex).toBeGreaterThan(tokenIndex);
  expect(intentIndex).toBeGreaterThan(participantIndex);
  expect(route).toContain('code: "FIRST_ACCESS_CREATION_FAILED"');
  expect(route).not.toContain("passwordTokenError ? null : passwordSetupToken");
});

test("first-access keeps retry context on post-password failures and clears it after full success", () => {
  const route = read("app/api/auth/first-access/route.ts");
  expect((route.match(/PASSWORD_UPDATED_POST_STEP_FAILED/g) || []).length).toBe(3);
  const tokenUsedIndex = route.indexOf(".update({ used_at: new Date().toISOString() })");
  const clearCookieIndex = route.indexOf('response.cookies.set(FIRST_ACCESS_COOKIE, ""');
  expect(tokenUsedIndex).toBeGreaterThan(route.indexOf("updateUserById"));
  expect(clearCookieIndex).toBeGreaterThan(tokenUsedIndex);
});

test("automatic login distinguishes success from failure after password creation", () => {
  const page = read("app/cadastro/page.tsx");
  expect(page).toContain("const { data: authData, error: signInError }");
  expect(page).toContain("if (!signInError && authData.session && eventId)");
  expect(page).toContain("Senha criada com sucesso. Entre para continuar no Evento.");
});

test("event resend reuses an unconsumed intent with a conditional token swap", () => {
  const route = read("app/api/events/[slug]/route.ts");
  expect(route).toContain('select("id,token_hash,expires_at,created_at")');
  expect(route).toContain('.is("consumed_at", null).maybeSingle()');
  expect(route).toContain("if (pendingIntent) {");
  expect(route).toContain("update({ token_hash: tokenHash, expires_at: expiresAt, created_at: issuedAt })");
  expect(route).toContain('.eq("id", pendingIntent.id).eq("token_hash", pendingIntent.token_hash).is("consumed_at", null).select("id").maybeSingle()');
  expect(route).toContain("if (!replacedIntent) {");
  expect(route).not.toContain('.from("simulado_event_join_intents").delete()');
});

test("a successful event resend keeps B and tells the user to use the latest link", () => {
  const route = read("app/api/events/[slug]/route.ts");
  const replaceIndex = route.indexOf("intentId = replacedIntent.id;");
  const sendIndex = route.indexOf("emails.send({", replaceIndex);
  const successIndex = route.indexOf('state: "confirmation_email_sent"', sendIndex);
  expect(replaceIndex).toBeGreaterThan(-1);
  expect(sendIndex).toBeGreaterThan(replaceIndex);
  expect(successIndex).toBeGreaterThan(sendIndex);
  expect(route).toContain("use o link da mensagem mais recente");
});

test("an explicit resend failure conditionally restores A and confirms exactly one rollback row", () => {
  const route = read("app/api/events/[slug]/route.ts");
  const emailFailureIndex = route.indexOf("if (emailError) {");
  const rollbackIndex = route.indexOf("update({ token_hash: pendingIntent.token_hash, expires_at: pendingIntent.expires_at, created_at: pendingIntent.created_at })", emailFailureIndex);
  const rollbackGuardIndex = route.indexOf('.eq("id", pendingIntent.id).eq("token_hash", tokenHash).is("consumed_at", null).select("id").maybeSingle()', rollbackIndex);
  const rollbackCheckIndex = route.indexOf("if (rollbackError || !rolledBackIntent)", rollbackGuardIndex);
  expect(emailFailureIndex).toBeGreaterThan(-1);
  expect(rollbackIndex).toBeGreaterThan(emailFailureIndex);
  expect(rollbackGuardIndex).toBeGreaterThan(rollbackIndex);
  expect(rollbackCheckIndex).toBeGreaterThan(rollbackGuardIndex);
  expect(route).toContain('eventType: "event_join_intent_rollback_success"');
  expect(route).toContain('eventType: "event_join_intent_rollback_failed"');
});

test("a concurrent resend conflict sends no second email", () => {
  const route = read("app/api/events/[slug]/route.ts");
  const conflictIndex = route.indexOf("if (!replacedIntent) {");
  const pendingResponseIndex = route.indexOf('state: "confirmation_pending"', conflictIndex);
  const sendIndex = route.indexOf("emails.send({", conflictIndex);
  expect(conflictIndex).toBeGreaterThan(-1);
  expect(pendingResponseIndex).toBeGreaterThan(conflictIndex);
  expect(sendIndex).toBeGreaterThan(pendingResponseIndex);
});

test("expired intents are renewed while consumed intents and first emissions use insert", () => {
  const route = read("app/api/events/[slug]/route.ts");
  const selectIndex = route.indexOf('select("id,token_hash,expires_at,created_at")');
  const expiryCheckIndex = route.indexOf("pendingIntent.expires_at > now", selectIndex);
  const updateIndex = route.indexOf("if (pendingIntent) {", expiryCheckIndex);
  const insertIndex = route.indexOf("} else {", updateIndex);
  expect(selectIndex).toBeGreaterThan(-1);
  expect(expiryCheckIndex).toBeGreaterThan(selectIndex);
  expect(updateIndex).toBeGreaterThan(expiryCheckIndex);
  expect(insertIndex).toBeGreaterThan(updateIndex);
  expect(route.slice(selectIndex, expiryCheckIndex)).toContain('.is("consumed_at", null)');
  expect(route.slice(insertIndex)).toContain('.insert({ event_id: event.id, email, token_hash: tokenHash, expires_at: expiresAt })');
});
