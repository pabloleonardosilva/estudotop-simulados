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
  expect(confirmRoute).toContain(
    "const next = student ? `/login?event=${encodeURIComponent(slug)}` : `/cadastro?event=${encodeURIComponent(slug)}&email=${encodeURIComponent(intent.email)}`;",
  );
  expect(confirmRoute).toContain("email: intent.email");
  expect(confirmRoute).not.toContain("consumed_at: new Date()");
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

test("a session/intent conflict requires explicit sign-out and the intent survives it", () => {
  const page = read("app/evento/[slug]/page-client.tsx");
  expect(page).toContain("setSessionConflict({ next: json.next, email: intentEmail })");
  expect(page).toContain("Sair e continuar cadastro");
  expect(page).toContain('variant="ghost" disabled={leavingSession} onClick={() => router.replace(`/evento/${encodeURIComponent(slug)}`)}>Cancelar');

  const handlerIndex = page.indexOf("async function handleLeaveSessionAndContinue");
  const signOutIndex = page.indexOf("await supabase.auth.signOut()", handlerIndex);
  const nextReplaceIndex = page.indexOf("router.replace(sessionConflict.next)", signOutIndex);
  expect(handlerIndex).toBeGreaterThan(-1);
  expect(signOutIndex).toBeGreaterThan(handlerIndex);
  expect(nextReplaceIndex).toBeGreaterThan(signOutIndex);

  // Nenhum signOut automático fora do handler explícito de "sair e continuar".
  expect(page.slice(0, handlerIndex)).not.toContain("signOut");
});

test("public registration blocks a mismatched event intent email before any side effect", () => {
  const registerRoute = read("app/api/auth/register/route.ts");

  const emailNormalizationIndex = registerRoute.indexOf("const email = body.email?.trim().toLowerCase();");
  const intentSelectIndex = registerRoute.indexOf('supabase.from("simulado_event_join_intents")');
  const mismatchCheckIndex = registerRoute.indexOf("intent.email.trim().toLowerCase() !== email");
  const mismatchReturnIndex = registerRoute.indexOf(
    'return NextResponse.json({ ok: false, message: "Não foi possível iniciar o cadastro." }, { status: 400 });',
    mismatchCheckIndex,
  );
  const eventIdAssignIndex = registerRoute.indexOf("eventId = intent.event_id;");
  const duplicateCheckIndex = registerRoute.indexOf('supabase.from("students").select("id, email, cpf")');
  const codeGenerationIndex = registerRoute.indexOf("generateNumericCode(6)");
  const confirmationInsertIndex = registerRoute.indexOf('supabase.from("student_registration_confirmations").insert(');
  const resendCallIndex = registerRoute.indexOf("resend.emails.send(");

  // Caso correto (item 9): a mesma variável `email`, já normalizada com
  // trim().toLowerCase() no topo da rota, é comparada contra
  // intent.email.trim().toLowerCase() — case-insensitive dos dois lados,
  // seguindo o normalizador já usado no resto do arquivo.
  expect(emailNormalizationIndex).toBeGreaterThan(-1);
  expect(intentSelectIndex).toBeGreaterThan(emailNormalizationIndex);
  expect(mismatchCheckIndex).toBeGreaterThan(intentSelectIndex);
  expect(mismatchReturnIndex).toBeGreaterThan(mismatchCheckIndex);

  // Caso de mismatch (item 8): o bloqueio ocorre antes de qualquer efeito
  // colateral — vínculo ao Evento, checagem de duplicidade, geração de
  // código, gravação da confirmation e envio pelo Resend.
  expect(eventIdAssignIndex).toBeGreaterThan(mismatchReturnIndex);
  expect(duplicateCheckIndex).toBeGreaterThan(mismatchReturnIndex);
  expect(codeGenerationIndex).toBeGreaterThan(mismatchReturnIndex);
  expect(confirmationInsertIndex).toBeGreaterThan(mismatchReturnIndex);
  expect(resendCallIndex).toBeGreaterThan(mismatchReturnIndex);

  // A intenção nunca é marcada como consumida por esta rota, em nenhum dos
  // dois casos — consumo continua sendo responsabilidade exclusiva de
  // /api/auth/confirm-registration, após o código ser confirmado.
  expect(registerRoute).not.toContain('simulado_event_join_intents").update({ consumed_at');

  // A resposta pública de mismatch é a mesma mensagem genérica já usada para
  // outra falha silenciosa nesta rota (falha de insert) — não menciona
  // e-mail nem Evento, não revelando a quem o link pertence (item 6).
  expect(registerRoute).toContain(
    'message: "Não foi possível iniciar o cadastro."',
  );

  // Intenção inválida/expirada/já consumida (itens de teste correspondentes):
  // a própria query de leitura já as exclui (is consumed_at null + expires_at
  // no futuro), então esses três casos caem no mesmo ramo de "sem intenção" —
  // cadastro comum, sem vínculo ao Evento, comportamento inalterado por esta
  // correção.
  expect(registerRoute).toContain('.is("consumed_at", null).gt("expires_at", new Date().toISOString())');
});

test("regular /cadastro flow outside of an Evento link stays untouched", () => {
  const cadastroPage = read("app/cadastro/page.tsx");
  expect(cadastroPage).toContain('setEventSignup(Boolean(query.get("event")))');
  expect(cadastroPage).toContain('fetch("/api/auth/register"');
  const registerRoute = read("app/api/auth/register/route.ts");
  expect(registerRoute).toContain("RECAPTCHA_ACTION, { minScore: 0.3 }");
});
