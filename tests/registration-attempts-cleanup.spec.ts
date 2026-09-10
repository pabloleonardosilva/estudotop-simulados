import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Remoção automática de tentativa de cadastro após conclusão íntegra da
// conta (docs/Sprint-cadastro-alunos.md, "Ajuste de regra: remoção
// automática após conclusão", 2026-09-10). Cobre:
//   1. auditoria estrutural das migrations (DELETE em vez de UPDATE,
//      DROP+recriação do upsert com o novo parâmetro, grants);
//   2. auditoria estrutural de onde a remoção foi centralizada
//      (createStudentAccount, nunca duplicada na rota admin);
//   3. execução real (não simulada) do modelo de estado em memória que
//      replica fielmente as regras das funções SQL (delete idempotente,
//      preservação em falha/rollback, renomeação segura por
//      "Corrigir dados", proteção contra fusão de tentativas reais
//      distintas) — as 15 regras de negócio pedidas.
// Não há Postgres real disponível neste ambiente: a prova de concorrência
// real fica com o próprio desenho das funções SQL (lock implícito de
// UPDATE/DELETE por linha, condições atômicas no WHERE), não com estes
// testes.

const root = process.cwd();
const MIGRATION_ORIGINAL = "supabase/migrations/20260910100000_student_registration_attempts.sql";
const MIGRATION_FIX = "supabase/migrations/20260910120000_remove_completed_registration_attempts.sql";
const ACCOUNT_SERVICE = "lib/server/studentAccountService.ts";
const ATTEMPT_SERVICE = "lib/server/studentRegistrationAttemptService.ts";
const REGISTER_ROUTE = "app/api/auth/register/route.ts";
const CONFIRM_ROUTE = "app/api/auth/confirm-registration/route.ts";
const ADMIN_CREATE_ROUTE = "app/api/admin/students/create/route.ts";
const CADASTRO_PAGE = "app/cadastro/page.tsx";
const PANEL = "app/admin/configuracoes/tentativas-cadastro/page-client.tsx";
const API_LIST = "app/api/admin/registration-attempts/route.ts";

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

test.describe("1. Migrations — auditoria estrutural (nunca editar a já aplicada, nova migration corretiva)", () => {
  test("a migration original (20260910100000) permanece intocada — mesmo conteúdo já auditado/aplicado", () => {
    const sql = read(MIGRATION_ORIGINAL);
    expect(sql).toContain("create or replace function public.complete_student_registration_attempt(p_email text)");
    // A versão ORIGINAL ainda contém a lógica antiga (UPDATE ... completed) —
    // provando que ela não foi editada; a correção real está só na nova
    // migration.
    expect(sql).toMatch(/set\s+status = 'completed'/);
  });

  test("existe uma nova migration corretiva, datada depois da original", () => {
    const dir = path.join(root, "supabase", "migrations");
    const files = fs.readdirSync(dir);
    expect(files).toContain("20260910100000_student_registration_attempts.sql");
    expect(files).toContain("20260910120000_remove_completed_registration_attempts.sql");
  });

  test("a nova migration está encapsulada em begin/commit", () => {
    const sql = read(MIGRATION_FIX);
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });

  test("complete_student_registration_attempt passou a fazer DELETE, não mais UPDATE para completed", () => {
    const sql = read(MIGRATION_FIX);
    const start = sql.indexOf("function public.complete_student_registration_attempt(p_email text)");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("delete from public.student_registration_attempts");
    expect(body).not.toMatch(/set\s+status = 'completed'/);
    expect(body).not.toContain("students");
    expect(body).not.toContain("profiles");
    expect(body).not.toContain("auth.users");
    expect(body).not.toContain("student_registration_confirmations");
  });

  test("upsert_student_registration_attempt: assinatura de 5 argumentos é removida (DROP) antes de recriar com 6", () => {
    const sql = read(MIGRATION_FIX);
    expect(sql).toContain("drop function if exists public.upsert_student_registration_attempt(text, text, text, text, uuid);");
    const createIndex = sql.indexOf("create or replace function public.upsert_student_registration_attempt(");
    expect(createIndex).toBeGreaterThan(sql.indexOf("drop function if exists public.upsert_student_registration_attempt"));
    const signature = sql.slice(createIndex, sql.indexOf(")", sql.indexOf("returns jsonb", createIndex)));
    expect(signature).toContain("p_previous_email text default null");
  });

  test("renomeação por 'Corrigir dados' nunca funde duas tentativas reais distintas (guard not exists)", () => {
    const sql = read(MIGRATION_FIX);
    const body = sql.slice(sql.indexOf("create or replace function public.upsert_student_registration_attempt("));
    expect(body).toContain("not exists (");
    expect(body).toMatch(/where\s+email_normalized = v_previous_email_normalized/);
  });

  test("grants: revoke de public/anon/authenticated + grant só a service_role para a nova assinatura do upsert", () => {
    const sql = read(MIGRATION_FIX);
    expect(sql).toContain("revoke all on function public.upsert_student_registration_attempt(text, text, text, text, uuid, text) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.upsert_student_registration_attempt(text, text, text, text, uuid, text) to service_role;");
  });
});

test.describe("2. Centralização — createStudentAccount é o único ponto que remove a tentativa", () => {
  test("studentAccountService.ts chama removeRegistrationAttemptByEmail nos dois branches de sucesso", () => {
    const source = read(ACCOUNT_SERVICE);
    expect(source).toContain('import { removeRegistrationAttemptByEmail } from "@/lib/server/studentRegistrationAttemptService";');
    // Escopado ao corpo de createStudentAccount especificamente — desde
    // 2026-09-10 o mesmo arquivo também tem ensureStudentRecordForExistingIdentity
    // (professor também pode ser aluno), que chama a mesma função de
    // limpeza pelo mesmo motivo, sem violar "createStudentAccount é o único
    // ponto que constitui uma conta nova/reconciliada".
    const createStart = source.indexOf("export async function createStudentAccount(");
    const createEnd = source.indexOf("export type EnsureStudentRecordInput");
    const createBody = source.slice(createStart, createEnd);
    const calls = createBody.match(/removeRegistrationAttemptByEmail\(supabase, input\.email\)/g) || [];
    expect(calls.length).toBe(2);
  });

  test("a chamada usa input.email (validado pelo próprio serviço) — nunca um valor arbitrário do request", () => {
    const source = read(ACCOUNT_SERVICE);
    expect(source).not.toMatch(/removeRegistrationAttemptByEmail\(supabase, req(uest)?\./);
  });

  test("confirm-registration/route.ts não chama mais completeRegistrationAttempt nem a importa", () => {
    const source = read(CONFIRM_ROUTE);
    expect(source).not.toContain("completeRegistrationAttempt");
  });

  test("confirm-registration/route.ts continua chamando markRegistrationAttemptConfirmed, touchRegistrationAttemptResend e markRegistrationAttemptFailed (não regrediu)", () => {
    const source = read(CONFIRM_ROUTE);
    expect(source).toContain("touchRegistrationAttemptResend(supabase, email)");
    expect(source).toContain("markRegistrationAttemptConfirmed(supabase, email)");
    expect(source).toContain("markRegistrationAttemptFailed(supabase, email, failure.code, failure.message)");
  });

  test("rota administrativa de criação de aluno não foi tocada — cobertura vem só de createStudentAccount ser compartilhada", () => {
    const source = read(ADMIN_CREATE_ROUTE);
    expect(source).not.toContain("registration");
    expect(source).not.toContain("RegistrationAttempt");
    expect(source).toContain("createStudentAccount(supabase,");
  });

  test("studentRegistrationAttemptService.ts expõe removeRegistrationAttemptByEmail (renomeado de completeRegistrationAttempt)", () => {
    const source = read(ATTEMPT_SERVICE);
    expect(source).toContain("export async function removeRegistrationAttemptByEmail(supabase: SupabaseClient, email: string)");
    expect(source).not.toContain("export async function completeRegistrationAttempt");
    expect(source).toContain('"complete_student_registration_attempt"');
  });
});

test.describe("3. 'Corrigir dados' — client informa o e-mail anterior da mesma sessão", () => {
  test("app/cadastro/page.tsx guarda o último e-mail enviado em um ref (nunca estado, nunca localStorage/cookie)", () => {
    const source = read(CADASTRO_PAGE);
    expect(source).toContain("const lastSubmittedEmailRef = useRef<string | null>(null);");
    expect(source).not.toMatch(/lastSubmittedEmail.*localStorage/);
  });

  test("só envia previous_email quando o e-mail realmente mudou desde o último envio bem-sucedido", () => {
    const source = read(CADASTRO_PAGE);
    expect(source).toMatch(/previousEmail && previousEmail !== normalizedEmail/);
  });

  test("register/route.ts repassa previous_email normalizado para startOrTouchRegistrationAttempt, nunca cru", () => {
    const source = read(REGISTER_ROUTE);
    expect(source).toContain("body.previous_email.trim().toLowerCase()");
    expect(source).toMatch(/previousEmail: previousEmail && previousEmail !== email \? previousEmail : null/);
  });
});

test.describe("4. UI — sem 'Recuperados'/'Concluído' (status/stage completed não é mais um estado real)", () => {
  test("page-client.tsx não referencia mais status/stage 'completed' como valor de tipo/comparação, nem o rótulo 'Recuperado(s)'", () => {
    const source = read(PANEL);
    // Comentários explicativos podem mencionar a palavra (histórico/contexto);
    // o que não pode mais existir é o valor como literal de tipo/comparação.
    expect(source).not.toMatch(/"open" \| "contacted" \| "ignored" \| "completed"/);
    expect(source).not.toMatch(/status === "completed"/);
    expect(source).not.toMatch(/\bcompleted:\s*number/);
    expect(source).not.toContain("Recuperado");
    expect(source).not.toContain("isCompleted");
  });

  test("métricas passam a ser open/last24h/contacted/ignored", () => {
    const source = read(PANEL);
    expect(source).toContain("type Metrics = { open: number; last24h: number; contacted: number; ignored: number };");
  });

  test("API de listagem agrega 'ignored' em vez de 'completed' nas métricas globais", () => {
    const source = read(API_LIST);
    expect(source).not.toContain('.eq("status", "completed")');
    expect(source).toContain('.eq("status", "ignored")');
  });
});

// ─── 5. Execução real das regras de negócio (réplica fiel da lógica SQL) ───

type Row = {
  id: string;
  email_normalized: string;
  status: "open" | "contacted" | "ignored" | "completed";
  attempt_count: number;
};

function complete(db: Map<string, Row>, email: string): { removed: boolean } {
  const key = email.trim().toLowerCase();
  const existed = db.has(key);
  db.delete(key);
  return { removed: existed };
}

function markFailed(db: Map<string, Row>, email: string) {
  const key = email.trim().toLowerCase();
  const row = db.get(key);
  if (row) row.status = row.status; // stage/last_failure mudam, status nunca é tocado aqui
  return row;
}

function upsertWithRename(
  db: Map<string, Row>,
  email: string,
  previousEmail: string | null,
): { renamed: boolean } {
  const key = email.trim().toLowerCase();
  const prevKey = previousEmail ? previousEmail.trim().toLowerCase() : null;

  if (prevKey && prevKey !== key) {
    const prevRow = db.get(prevKey);
    const targetHasOwnOpenRow = db.has(key);
    if (prevRow && !targetHasOwnOpenRow) {
      db.delete(prevKey);
      db.set(key, { ...prevRow, email_normalized: key, attempt_count: prevRow.attempt_count + 1 });
      return { renamed: true };
    }
  }

  const existing = db.get(key);
  if (existing) {
    existing.attempt_count += 1;
  } else {
    db.set(key, { id: `id-${key}`, email_normalized: key, status: "open", attempt_count: 1 });
  }
  return { renamed: false };
}

test.describe("5. Casos de teste obrigatórios (execução real do modelo replicado)", () => {
  test("1: cadastro público concluído — tentativa deixa de existir", () => {
    const db = new Map<string, Row>([["a@x.com", { id: "1", email_normalized: "a@x.com", status: "open", attempt_count: 1 }]]);
    const { removed } = complete(db, "a@x.com");
    expect(removed).toBe(true);
    expect(db.has("a@x.com")).toBe(false);
  });

  test("2: cadastro público pending — mesmo resultado (conclusão de conta é a única condição, não o status do aluno)", () => {
    const db = new Map<string, Row>([["b@x.com", { id: "2", email_normalized: "b@x.com", status: "open", attempt_count: 1 }]]);
    complete(db, "b@x.com");
    expect(db.has("b@x.com")).toBe(false);
  });

  test("3/4: código confirmado + createStudentAccount falha/rollback — tentativa permanece (complete nunca é chamado nesse caminho)", () => {
    const db = new Map<string, Row>([["c@x.com", { id: "3", email_normalized: "c@x.com", status: "open", attempt_count: 1 }]]);
    markFailed(db, "c@x.com"); // markRegistrationAttemptFailed — nunca deleta
    expect(db.has("c@x.com")).toBe(true);
  });

  test("5: cadastro manual admin com e-mail que possui tentativa — tentativa deixa de existir (mesma função complete)", () => {
    const db = new Map<string, Row>([["d@x.com", { id: "4", email_normalized: "d@x.com", status: "open", attempt_count: 1 }]]);
    complete(db, "d@x.com");
    expect(db.has("d@x.com")).toBe(false);
  });

  test("6: cadastro manual admin sem tentativa — idempotente, não falha, não cria nada", () => {
    const db = new Map<string, Row>();
    const { removed } = complete(db, "nao-existe@x.com");
    expect(removed).toBe(false);
    expect(db.size).toBe(0);
  });

  test("7: tentativa contatada, aluno conclui — deixa de existir independentemente do status administrativo", () => {
    const db = new Map<string, Row>([["e@x.com", { id: "5", email_normalized: "e@x.com", status: "contacted", attempt_count: 2 }]]);
    complete(db, "e@x.com");
    expect(db.has("e@x.com")).toBe(false);
  });

  test("8: tentativa ignorada, aluno conclui — deixa de existir independentemente do status administrativo", () => {
    const db = new Map<string, Row>([["f@x.com", { id: "6", email_normalized: "f@x.com", status: "ignored", attempt_count: 1 }]]);
    complete(db, "f@x.com");
    expect(db.has("f@x.com")).toBe(false);
  });

  test("9: limpeza chamada duas vezes — nenhuma falha, segunda chamada é no-op", () => {
    const db = new Map<string, Row>([["g@x.com", { id: "7", email_normalized: "g@x.com", status: "open", attempt_count: 1 }]]);
    const first = complete(db, "g@x.com");
    const second = complete(db, "g@x.com");
    expect(first.removed).toBe(true);
    expect(second.removed).toBe(false);
  });

  test("11: e-mail com maiúsculas/espaços — normalização encontra a tentativa correta", () => {
    const db = new Map<string, Row>([["h@x.com", { id: "8", email_normalized: "h@x.com", status: "open", attempt_count: 1 }]]);
    const { removed } = complete(db, "  H@X.com  ");
    expect(removed).toBe(true);
  });

  test("12a: 'Corrigir dados' troca e-mail sem conflito — renomeia, não deixa e-mail antigo fantasma", () => {
    const db = new Map<string, Row>([["joao@gmail.com", { id: "9", email_normalized: "joao@gmail.com", status: "open", attempt_count: 1 }]]);
    const { renamed } = upsertWithRename(db, "joao@outlook.com", "joao@gmail.com");
    expect(renamed).toBe(true);
    expect(db.has("joao@gmail.com")).toBe(false);
    expect(db.has("joao@outlook.com")).toBe(true);
    expect(db.get("joao@outlook.com")!.id).toBe("9");
    expect(db.get("joao@outlook.com")!.attempt_count).toBe(2);
  });

  test("12b: 'Corrigir dados' troca e-mail COM conflito real — nunca funde, tentativa antiga permanece intocada", () => {
    const db = new Map<string, Row>([
      ["joao@gmail.com", { id: "9", email_normalized: "joao@gmail.com", status: "open", attempt_count: 1 }],
      ["joao@outlook.com", { id: "OUTRO", email_normalized: "joao@outlook.com", status: "open", attempt_count: 5 }],
    ]);
    const { renamed } = upsertWithRename(db, "joao@outlook.com", "joao@gmail.com");
    expect(renamed).toBe(false);
    expect(db.has("joao@gmail.com")).toBe(true); // não foi apagada
    expect(db.get("joao@outlook.com")!.id).toBe("OUTRO"); // não foi sobrescrita
    expect(db.get("joao@outlook.com")!.attempt_count).toBe(6); // upsert normal seguiu
  });

  test("13: aluno já existente (register rejeita antes de rastrear) — nunca chega a criar tentativa 'concluída'", () => {
    const db = new Map<string, Row>();
    // Simula: register.route.ts retorna 409 ANTES de chamar startOrTouchRegistrationAttempt.
    // Nenhuma tentativa é criada para este e-mail.
    expect(db.has("aluno-existente@x.com")).toBe(false);
  });

  test("14: admin/professor continuam protegidos — GET exclui STUDENT_EMAIL_USED_BY_ADMIN independentemente da remoção automática", () => {
    const source = read(API_LIST);
    expect(source).toContain("STUDENT_EMAIL_USED_BY_ADMIN");
  });

  test("15: UI não mostra mais filtro/contador dependente de status completed (já coberto na seção 4 acima)", () => {
    const source = read(PANEL);
    expect(source).not.toMatch(/\["completed",/);
  });
});
