/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
// Cadastro manual de aluno pelo Admin (POST /api/admin/students/create): CPF opcional, nome/e-mail/
// telefone obrigatórios. Executa a rota real com Auth, banco, Resend e logs simulados — nenhum e-mail
// real é enviado e nenhuma conta real é criada.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const stubs = new Map();
const cache = new Map();
function loadTypeScript(filePath) {
  const absolute = path.resolve(filePath);
  if (stubs.has(absolute)) return stubs.get(absolute);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const source = fs.readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (request) => {
    if (request === "server-only") return {};
    if (stubs.has(request)) return stubs.get(request);
    if (request.startsWith("./")) return loadTypeScript(path.resolve(path.dirname(absolute), `${request}.ts`));
    if (request.startsWith("@/")) return loadTypeScript(path.resolve(request.slice(2) + ".ts"));
    return require(request);
  };
  new Function("require", "module", "exports", "__filename", "__dirname", output)(localRequire, module, module.exports, absolute, path.dirname(absolute));
  return module.exports;
}
const stub = (modulePath, exports) => stubs.set(path.resolve(modulePath), exports);

const { NextResponse } = require("next/server");
let currentAdmin = { id: "admin-unit", email: "admin@example.invalid" };
let students = [];
const createdAccounts = [];
const sentEmails = [];

function memorySupabase() {
  return {
    from(table) {
      assert.equal(table, "students");
      const filters = [];
      const builder = {
        select: () => builder,
        limit: () => builder,
        eq: () => builder,
        or: (expression) => {
          const clauses = expression.split(",").map((clause) => { const [column, , ...value] = clause.split("."); return [column, value.join(".")]; });
          filters.push((row) => clauses.some(([column, value]) => row[column] === value));
          return builder;
        },
        update: () => builder,
        maybeSingle: async () => ({ data: students.find((row) => filters.every((filter) => filter(row))) || null, error: null }),
        then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return builder;
    },
  };
}

stub("lib/server/authGuard.ts", { requireAdmin: async () => currentAdmin || NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 }) });
stub("lib/server/supabaseAdmin.ts", { createSupabaseAdminClient: () => memorySupabase() });
stub("lib/server/studentAccountRepair.ts", { authUserExists: async () => true });
stub("lib/server/studentAccountService.ts", {
  createStudentAccount: async (_supabase, input) => {
    createdAccounts.push(input);
    const userId = `student-${createdAccounts.length}`;
    students.push({ id: userId, email: input.email, cpf: input.cpf, name: input.fullName });
    return { userId };
  },
  studentAccountErrorResponse: () => ({ ok: false, message: "Falha na conta." }),
});
stub("lib/logging/activity-log.ts", { logActivity: async () => undefined });
stub("lib/logging/error-log.ts", { logSystemError: async () => undefined });
stub("lib/server/publicAppUrl.ts", { getPublicAppUrl: () => "https://example.invalid" });
stub("app/lib/email/studentWelcomeTemplate.ts", { studentWelcomeTemplate: () => "<p>ok</p>", studentWelcomePlainText: () => "ok" });
stubs.set("resend", { Resend: class { constructor() { this.emails = { send: async (message) => { sentEmails.push(message.to); return {}; } }; } } });

const previousResendKey = process.env.RESEND_API_KEY;
process.env.RESEND_API_KEY = "unit-test-key";
const route = loadTypeScript("app/api/admin/students/create/route.ts");
const post = (body) => route.POST(new Request("http://localhost/api/admin/students/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const VALID_CPF = "529.982.247-25";
const base = { fullName: "Maria da Silva", email: "Maria@Example.com", phone: "(31) 99999-9999", origin: "Manual" };

async function run() {
  // A: nome + e-mail + telefone, sem CPF => sucesso, persistido como null (sem placeholder).
  for (const cpf of [undefined, null, "", "   "]) {
    students = [];
    createdAccounts.length = 0;
    const response = await post(cpf === undefined ? base : { ...base, cpf });
    const json = await response.json();
    assert.equal(response.status, 200, `sem CPF (${JSON.stringify(cpf)})`);
    assert.equal(json.ok, true);
    assert.equal(createdAccounts[0].cpf, null, "CPF ausente vira null");
    assert.equal(createdAccounts[0].email, "maria@example.com");
    assert.equal(createdAccounts[0].phone, "(31) 99999-9999");
    assert.equal(createdAccounts[0].status, "pending");
    assert.equal(typeof createdAccounts[0].temporaryPassword, "string");
  }
  assert.equal(sentEmails.length, 4, "e-mail de boas-vindas segue o fluxo (Resend simulado)");

  // B: CPF válido => sucesso, normalizado para dígitos.
  students = [];
  createdAccounts.length = 0;
  let response = await post({ ...base, cpf: VALID_CPF });
  assert.equal(response.status, 200);
  assert.equal(createdAccounts[0].cpf, "52998224725");

  // C: CPF inválido preenchido => erro, nenhuma conta criada.
  for (const cpf of ["529.982.247-24", "111.111.111-11", "abc", "123"]) {
    createdAccounts.length = 0;
    response = await post({ ...base, email: "outro@example.com", cpf });
    assert.equal(response.status, 400, `CPF inválido ${cpf}`);
    assert.equal((await response.json()).message, "CPF inválido. Verifique os dígitos informados.");
    assert.equal(createdAccounts.length, 0);
  }

  // D: CPF duplicado preenchido => 409 CPF_ALREADY_EXISTS.
  students = [{ id: "existing-1", email: "existente@example.com", cpf: "52998224725", name: "Existente" }];
  createdAccounts.length = 0;
  response = await post({ ...base, email: "novo@example.com", cpf: VALID_CPF });
  let json = await response.json();
  assert.equal(response.status, 409);
  assert.equal(json.code, "CPF_ALREADY_EXISTS");
  assert.equal(createdAccounts.length, 0);

  // Sem CPF não há consulta de duplicidade por CPF: alunos sem CPF não colidem entre si.
  students = [{ id: "no-cpf-1", email: "semcpf@example.com", cpf: null, name: "Sem CPF" }];
  response = await post({ ...base, email: "outro-sem-cpf@example.com" });
  assert.equal(response.status, 200);

  // E: e-mail duplicado sem CPF => 409 EMAIL_ALREADY_EXISTS.
  students = [{ id: "existing-2", email: "maria@example.com", cpf: null, name: "Maria" }];
  createdAccounts.length = 0;
  response = await post(base);
  json = await response.json();
  assert.equal(response.status, 409);
  assert.equal(json.code, "EMAIL_ALREADY_EXISTS");
  assert.equal(createdAccounts.length, 0);

  // F/G/H: nome, e-mail e telefone continuam obrigatórios; telefone precisa de DDD.
  students = [];
  for (const [field, value] of [["fullName", ""], ["email", ""], ["phone", ""], ["fullName", undefined], ["email", undefined], ["phone", undefined]]) {
    const body = { ...base };
    if (value === undefined) delete body[field]; else body[field] = value;
    response = await post(body);
    assert.equal(response.status, 400, `${field} ausente`);
    assert.equal((await response.json()).message, "Nome completo, e-mail e telefone são obrigatórios.");
  }
  response = await post({ ...base, phone: "9999-9999" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, "Telefone inválido. Informe o número com DDD.");

  // requireAdmin preservado.
  currentAdmin = null;
  assert.equal((await post(base)).status, 401);
  currentAdmin = { id: "admin-unit", email: "admin@example.invalid" };

  // I: política de senha sem CPF continua funcionando (e com CPF segue bloqueando o CPF na senha).
  const policy = loadTypeScript("lib/auth/passwordPolicy.ts");
  assert.equal(policy.validatePassword("Planeta#Azul27", { fullName: "Maria da Silva", email: "maria@example.com", cpf: null, phone: "31999999999" }).valid, true);
  assert.equal(policy.containsPersonalData("Abc#52998224725", { cpf: null }), false);
  assert.equal(policy.containsPersonalData("Abc#52998224725", { cpf: "52998224725" }), true);
  const contextSource = fs.readFileSync("lib/server/passwordPolicyContext.ts", "utf8");
  assert.equal(contextSource.includes("cpf: student?.cpf || null"), true);

  // J: listagem e perfil exibem "—" para CPF nulo e a busca tolera null.
  const listSource = fs.readFileSync("app/admin/alunos/page-client.tsx", "utf8");
  assert.equal(listSource.includes('CPF: {student.cpf ? formatCpf(student.cpf) : "—"}'), true);
  assert.equal(listSource.includes('return (value ?? "")'), true);
  const profileSource = fs.readFileSync("app/admin/alunos/[id]/page-client.tsx", "utf8");
  assert.equal(profileSource.includes('function fmtCpf(value: string | null): string {\n  if (!value) return "—";') || profileSource.includes('function fmtCpf(value: string | null): string {\r\n  if (!value) return "—";'), true);
  assert.equal(profileSource.includes('setEditCpf(student.cpf ?? "")'), true, "edição posterior aceita aluno sem CPF");

  // Frontend do cadastro manual.
  const pageSource = fs.readFileSync("app/admin/alunos/novo/page.tsx", "utf8");
  assert.equal(pageSource.includes('<DarkField label="CPF (opcional)">'), true);
  assert.equal(pageSource.includes("CPF obrigatório"), false);
  assert.equal(pageSource.includes("CPF é obrigatório"), false);
  const cpfInput = pageSource.slice(pageSource.indexOf('name="cpf"'), pageSource.indexOf("/>", pageSource.indexOf('name="cpf"')));
  assert.equal(cpfInput.includes("required"), false, "CPF sem required");
  const phoneInput = pageSource.slice(pageSource.indexOf('name="phone"'), pageSource.indexOf("/>", pageSource.indexOf('name="phone"')));
  assert.equal(phoneInput.includes("required"), true, "telefone obrigatório");
  assert.equal(pageSource.includes("if (cpfClean && !isValidCpf(cpfClean))"), true);
  assert.equal(pageSource.includes("cpf: cpfClean || null,"), true);

  // Cadastro público não foi alterado: continua exigindo CPF.
  assert.equal(fs.readFileSync("app/cadastro/page.tsx", "utf8").includes("O CPF é obrigatório e evita cadastros duplicados."), true);
}

run().then(() => console.log("Admin student create unit tests: PASS")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (previousResendKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousResendKey;
});
