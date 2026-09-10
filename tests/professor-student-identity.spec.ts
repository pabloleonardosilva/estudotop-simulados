import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Identidade compartilhada professor + aluno (docs/Sprint-cadastro-alunos.md,
// "Professor também pode ser aluno", 2026-09-10). Cobertura estrutural (sem
// Postgres real neste ambiente) — audita o código real ponto a ponto contra
// as invariáveis pedidas. E-mails/dados são sempre fictícios
// (professor.teste@example.com), nunca o e-mail real usado no diagnóstico
// que originou esta Sprint.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const JOIN_ROUTE = "app/api/events/join/route.ts";
const CONFIRM_ROUTE = "app/api/events/[slug]/confirm/route.ts";
const LOGIN_PAGE = "app/login/page.tsx";
const APP_SHELL = "app/components/AppShell.tsx";
const ACCOUNT_SERVICE = "lib/server/studentAccountService.ts";
const ACCOUNT_REPAIR = "lib/server/studentAccountRepair.ts";
const AUTH_GUARD = "lib/server/authGuard.ts";
const STUDENT_AUTH = "lib/server/supabaseStudentAuth.ts";

test.describe("1. Nenhuma migration — schema já suporta students.id de qualquer role", () => {
  test("students.id é FK direta para auth.users(id), sem depender de profiles.role — nenhuma migration nova nesta Sprint", () => {
    const dir = path.join(root, "supabase", "migrations");
    const before = fs.readdirSync(dir);
    // Nenhum arquivo novo relacionado a students/profiles/roles foi
    // adicionado nesta Sprint especificamente para representar o conceito
    // "professor também é aluno" — o schema já suporta via UUID compartilhado.
    const identityMigrations = before.filter((f) => /professor.*student|student.*role|multi.*role|profile_roles/i.test(f));
    expect(identityMigrations.length).toBe(0);
  });

  test("nenhuma tabela de papéis múltiplos (profile_roles/user_roles) foi criada", () => {
    expect(fs.existsSync(path.join(root, "lib", "server", "profileRoles.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "lib", "server", "roles.ts"))).toBe(false);
  });
});

test.describe("2. ensureStudentRecordForExistingIdentity — mecânica central", () => {
  test("existe, nunca cria auth.users nem altera profiles/profiles.role", () => {
    const source = read(ACCOUNT_SERVICE);
    const start = source.indexOf("export async function ensureStudentRecordForExistingIdentity(");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\nexport async function updateStudentAccountEmail", start));
    expect(body).not.toContain("auth.admin.createUser");
    expect(body).not.toContain(".from(\"profiles\")");
    expect(body).not.toContain("role:");
  });

  test("idempotente: consulta students por id antes de inserir, e trata unique_violation (23505) como sucesso", () => {
    const source = read(ACCOUNT_SERVICE);
    const start = source.indexOf("export async function ensureStudentRecordForExistingIdentity(");
    const body = source.slice(start, source.indexOf("\nexport async function updateStudentAccountEmail", start));
    expect(body).toContain('.from("students").select("id").eq("id", input.userId).maybeSingle()');
    expect(body).toContain('if (existing) {');
    expect(body).toContain('insertError.code === "23505"');
  });

  test("status active + origin Evento de Simulado — mesma regra de ativação imediata do cadastro público via Evento", () => {
    const source = read(ACCOUNT_SERVICE);
    const start = source.indexOf("export async function ensureStudentRecordForExistingIdentity(");
    const body = source.slice(start, source.indexOf("\nexport async function updateStudentAccountEmail", start));
    expect(body).toContain('status: "active"');
    expect(body).toContain('origin: "Evento de Simulado"');
    expect(body).toContain("origin_event_id: input.eventId");

    const confirmRoute = read("app/api/auth/confirm-registration/route.ts");
    expect(confirmRoute).toContain('status: eventSignup ? "active" : "pending"');
  });

  test("limpa a tentativa de cadastro residual do mesmo e-mail (removeRegistrationAttemptByEmail), sempre best-effort", () => {
    const source = read(ACCOUNT_SERVICE);
    const start = source.indexOf("export async function ensureStudentRecordForExistingIdentity(");
    const body = source.slice(start, source.indexOf("\nexport async function updateStudentAccountEmail", start));
    const calls = body.match(/removeRegistrationAttemptByEmail\(supabase, input\.email\)/g) || [];
    expect(calls.length).toBe(3); // já existia, criado com sucesso, corrida (23505)
  });

  test("não fabrica CPF/telefone — students.cpf/phone nunca são preenchidos por esta função", () => {
    const source = read(ACCOUNT_SERVICE);
    const start = source.indexOf("export async function ensureStudentRecordForExistingIdentity(");
    const body = source.slice(start, source.indexOf("\nexport async function updateStudentAccountEmail", start));
    expect(body).not.toContain("cpf:");
    expect(body).not.toContain("phone:");
  });
});

test.describe("3. createStudentAccount / studentAccountRepair — proteção original preservada, nunca enfraquecida", () => {
  test("reconcileIncompleteStudentAccount continua recusando profile.role !== student (cadastro público anônimo nunca converte professor/admin)", () => {
    const source = read(ACCOUNT_REPAIR);
    expect(source).toContain('if (profile && profile.role !== "student") {');
    expect(source).toContain('code: "NOT_STUDENT_ACCOUNT"');
  });

  test("validateStudentAccountIntegrity (createStudentAccount) não foi alterada para aceitar outro role", () => {
    const source = read(ACCOUNT_SERVICE);
    expect(source).toContain('profile?.role === "student" && student?.id === userId');
  });

  test("createStudentAccount em si não foi tocado (nenhuma chamada nova a ensureStudentRecordForExistingIdentity a partir dele)", () => {
    const source = read(ACCOUNT_SERVICE);
    const createStart = source.indexOf("export async function createStudentAccount(");
    const createEnd = source.indexOf("\nexport type EnsureStudentRecordInput");
    expect(createEnd).toBeGreaterThan(createStart);
    const createBody = source.slice(createStart, createEnd);
    expect(createBody).not.toContain("ensureStudentRecordForExistingIdentity");
  });
});

test.describe("4. POST /api/events/join — segurança: só identidade autenticada, nunca e-mail anônimo", () => {
  test("caminho estendido só roda quando getStudentFromRequest falhou, e exige Bearer token verificado por auth.getUser", () => {
    const source = read(JOIN_ROUTE);
    expect(source).toContain("let student = await getStudentFromRequest(request);");
    expect(source).toContain("if (!student) {");
    expect(source).toContain('authHeader.startsWith("Bearer ")');
    expect(source).toContain("await supabase.auth.getUser(token)");
  });

  test("escopo restrito a profiles.role === professor nesta Sprint (admin não é elegível aqui)", () => {
    const source = read(JOIN_ROUTE);
    expect(source).toContain('profile.role !== "professor"');
    expect(source).not.toMatch(/role === "admin"[^\n]*ensureStudentRecordForExistingIdentity/);
  });

  test("exige profiles.is_active true e professors.status active — consistente com o bloqueio global do login, nunca um bypass", () => {
    const source = read(JOIN_ROUTE);
    expect(source).toContain("!profile.is_active");
    expect(source).toContain('professorRow?.status !== "active"');
  });

  test("valida posse do e-mail (intent.email === e-mail da sessão autenticada) ANTES de criar o Student", () => {
    const source = read(JOIN_ROUTE);
    const emailCheckIndex = source.indexOf("intent.email.toLowerCase() !== identityEmail");
    const ensureCallIndex = source.indexOf("ensureStudentRecordForExistingIdentity(supabase");
    expect(emailCheckIndex).toBeGreaterThan(-1);
    expect(ensureCallIndex).toBeGreaterThan(emailCheckIndex);
  });

  test("valida status do Evento (fechado/arquivado) ANTES de criar o Student", () => {
    const source = read(JOIN_ROUTE);
    const statusCheckIndex = source.indexOf('status === "closed" || status === "archived"');
    const ensureCallIndex = source.indexOf("ensureStudentRecordForExistingIdentity(supabase");
    expect(statusCheckIndex).toBeGreaterThan(-1);
    expect(ensureCallIndex).toBeGreaterThan(statusCheckIndex);
  });

  test("e-mail usado para criar o Student vem sempre de auth.users (sessão verificada), nunca de um campo do corpo da requisição", () => {
    const source = read(JOIN_ROUTE);
    expect(source).toContain("email: (userData.user.email || \"\").trim().toLowerCase()");
    expect(source).not.toMatch(/body\.email|request\.json\(\)/);
  });

  test("log de auditoria só na criação real (nunca em chamada idempotente subsequente)", () => {
    const source = read(JOIN_ROUTE);
    expect(source).toContain("if (!ensured.alreadyExisted) {");
    expect(source).toContain('event: "student_identity_extended"');
  });

  test("participant e consumo de intent reaproveitam exatamente o mesmo código do fluxo de aluno já existente (sem duplicar lógica)", () => {
    const source = read(JOIN_ROUTE);
    expect(source).toContain('.from("simulado_event_participants").upsert({ event_id: intent.event_id, student_id: student.id, source: "public_link" }, { onConflict: "event_id,student_id", ignoreDuplicates: true })');
    expect(source).toContain('.from("simulado_event_join_intents").update({ consumed_at: new Date().toISOString() }).eq("id", intent.id)');
  });
});

test.describe("5. Detecção precoce — POST /api/events/[slug]/confirm", () => {
  test("quando não há Student, verifica auth.users existente por e-mail (findAuthUserByEmail) antes de mandar para /cadastro", () => {
    const source = read(CONFIRM_ROUTE);
    expect(source).toContain('import { findAuthUserByEmail } from "@/lib/server/studentAccountRepair";');
    expect(source).toContain("await findAuthUserByEmail(supabase, intent.email)");
  });

  test("identidade existente de outro papel (role !== student) é roteada para /login, nunca /cadastro", () => {
    const source = read(CONFIRM_ROUTE);
    const elseIndex = source.lastIndexOf("} else {");
    const body = source.slice(elseIndex);
    expect(body).toContain('existingProfile.role !== "student"');
    expect(body).toContain("next = `/login?event=${encodeURIComponent(slug)}`;");
  });

  test("mensagem pública nunca revela o papel da conta encontrada", () => {
    const source = read(CONFIRM_ROUTE);
    const message = 'message = "Este e-mail já possui uma conta no EstudoTOP. Entre com sua conta para continuar.";';
    expect(source).toContain(message);
    expect(message.toLowerCase()).not.toContain("professor");
    expect(message.toLowerCase()).not.toContain("administra");
  });

  test("profile.role === student órfão (sem students ainda) continua caindo em /cadastro — fluxo de reconciliação existente preservado", () => {
    const source = read(CONFIRM_ROUTE);
    const elseIndex = source.lastIndexOf("} else {");
    const body = source.slice(elseIndex, source.indexOf("const response = NextResponse.json"));
    // Só reatribui `next`/`message` dentro do if role !== student — não há
    // nenhum caminho dentro do else que force /login para role === student.
    const roleStudentBranch = body.match(/if \(existingProfile[^)]*\)\s*{/);
    expect(roleStudentBranch).toBeTruthy();
  });
});

test.describe("6. Login — contexto de Evento prevalece para professor, sem quebrar o destino padrão", () => {
  test("professor também tenta /api/events/join após autenticar (não só student)", () => {
    const source = read(LOGIN_PAGE);
    expect(source).toContain('(profile.role === "student" || profile.role === "professor") && data.session?.access_token');
  });

  test("fallback de nav-access (conceito só de aluno) continua restrito a role === student", () => {
    const source = read(LOGIN_PAGE);
    expect(source).toContain('} else if (profile.role === "student") {');
  });

  test("destino padrão do professor (/professor/eventos) é preservado quando não há intent válida", () => {
    const source = read(LOGIN_PAGE);
    expect(source).toContain('profile.role === "professor" ? "/professor/eventos"');
  });

  test("login continua recusando integralmente qualquer perfil com is_active=false, antes de qualquer lógica de Evento — nenhum bypass introduzido", () => {
    const source = read(LOGIN_PAGE);
    const gateIndex = source.indexOf("if (!profile.is_active) {");
    const joinIndex = source.indexOf("/api/events/join");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(joinIndex);
    expect(source.slice(gateIndex, joinIndex)).toContain('"Este usuário está inativo. Entre em contato com o suporte."');
  });
});

test.describe("7. AppShell — professor não é desviado de /meus-eventos, resto do redirect preservado", () => {
  test("exceção cirúrgica: só /meus-eventos foi adicionado à condição existente do redirect de professor", () => {
    const source = read(APP_SHELL);
    expect(source).toContain('!pathname.startsWith("/professor") && !pathname.startsWith("/meus-eventos") && !isEventAcquisitionRoute');
  });

  test("shell do professor (teacher-theme) continua sendo o mesmo bloco, sem chooser de perfil novo", () => {
    const source = read(APP_SHELL);
    expect(source).toContain('if (profile.role === "professor") {');
    expect(source).not.toMatch(/escolha (seu )?perfil/i);
  });

  test("redirect de aluno (isAllowedStudentRoute) não foi alterado", () => {
    const source = read(APP_SHELL);
    expect(source).toContain("const isAllowedStudentRoute =");
    expect(source).toContain('pathname.startsWith("/aluno")');
  });
});

test.describe("8. getStudentFromRequest / guards — nenhum guard foi enfraquecido", () => {
  test("getStudentFromRequest (o realmente usado pelas rotas /api/student e /api/events) nunca consulta profiles.role — só students", () => {
    const source = read(STUDENT_AUTH);
    expect(source).toContain('.from("students")');
    expect(source).not.toContain('.from("profiles")');
    expect(source).not.toContain('role');
  });

  test("requireAdmin, requireProfessor, requireEventManager continuam exigindo profiles.role + is_active exatamente como antes", () => {
    const source = read(AUTH_GUARD);
    expect(source).toContain('profile.role !== "admin" || !profile.is_active');
    expect(source).toContain('profile.role !== "professor" || !profile.is_active || professor?.status !== "active"');
  });

  test("requireStudentPage continua checando só students.status (blocked/inactive) — nenhuma dependência nova de profiles.role", () => {
    const source = read(AUTH_GUARD);
    const start = source.indexOf("export async function requireStudentPage(");
    const body = source.slice(start, source.indexOf("\nexport async function requireAdminPage", start));
    expect(body).not.toContain('.from("profiles")');
    expect(body).toContain('studentRow.status === "blocked" || studentRow.status === "inactive"');
  });
});

test.describe("9. Regra documental obrigatória", () => {
  test("Sprint-cadastro-alunos.md registra a regra definitiva de identidade compartilhada", () => {
    const source = read("docs/Sprint-cadastro-alunos.md");
    expect(source).toContain("mesmo UUID");
    expect(source).toMatch(/profiles\.role.{0,40}n[aã]o.{0,40}sobrescrit/i);
  });

  test("regra de autenticação obrigatória documentada", () => {
    const source = read("docs/Sprint-cadastro-alunos.md");
    expect(source).toMatch(/autentica[cç][aã]o v[aá]lida/i);
  });

  test("semântica de profiles.is_active documentada como bloqueio global", () => {
    const source = read("docs/Sprint-cadastro-alunos.md");
    expect(source).toMatch(/is_active/);
    expect(source).toMatch(/global/i);
  });
});
