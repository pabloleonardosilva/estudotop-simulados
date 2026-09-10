import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Integração de "Tentativas de cadastro" ao fluxo de Evento
// (docs/Sprint-cadastro-alunos.md, "Integração com Evento", 2026-09-10) +
// correção do campo Busca + padronização de dropdowns na Central. Sem
// Postgres real neste ambiente: cobertura estrutural (auditoria do código
// real) — a prova de comportamento em runtime fica com o desenho das
// funções SQL já atômicas/idempotentes (inalteradas nesta Sprint) e com a
// suíte tests/registration-attempts-cleanup.spec.ts já existente.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const EVENT_ROUTE = "app/api/events/[slug]/route.ts";
const ATTEMPT_SERVICE = "lib/server/studentRegistrationAttemptService.ts";
const PANEL = "app/admin/configuracoes/tentativas-cadastro/page-client.tsx";
const LOGS_PANEL = "app/admin/logs/page-client.tsx";
const SIMPLE_SELECT = "app/components/ui/PremiumSimpleSelect.tsx";

test.describe("1. Evento — primeira etapa passa a instrumentar a tentativa", () => {
  test("POST /api/events/[slug]/route.ts importa e chama startOrTouchEventRegistrationAttempt", () => {
    const source = read(EVENT_ROUTE);
    expect(source).toContain(
      'import { startOrTouchEventRegistrationAttempt } from "@/lib/server/studentRegistrationAttemptService";',
    );
    expect(source).toContain("await startOrTouchEventRegistrationAttempt(supabase, { email, eventId: event.id });");
  });

  test("só rastreia depois do e-mail de confirmação ter sido enviado com sucesso (após o guard de emailError)", () => {
    const source = read(EVENT_ROUTE);
    const emailErrorGuardIndex = source.indexOf('if (emailError) {');
    const trackingIndex = source.indexOf("startOrTouchEventRegistrationAttempt(supabase, { email, eventId: event.id })");
    const finalReturnIndex = source.indexOf('state: "confirmation_email_sent"');
    expect(emailErrorGuardIndex).toBeGreaterThan(-1);
    expect(trackingIndex).toBeGreaterThan(emailErrorGuardIndex);
    expect(trackingIndex).toBeLessThan(finalReturnIndex);
  });

  test("nunca cria tentativa para e-mail que já pertence a um aluno existente (guard students antes da chamada)", () => {
    const source = read(EVENT_ROUTE);
    const guardIndex = source.indexOf('supabase.from("students").select("id").eq("email", email).maybeSingle()');
    const trackingIndex = source.indexOf("startOrTouchEventRegistrationAttempt(supabase, { email, eventId: event.id })");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(trackingIndex).toBeGreaterThan(guardIndex);
    // A chamada fica condicionada ao guard (dentro do if (!existingStudent)).
    const between = source.slice(guardIndex, trackingIndex);
    expect(between).toContain("if (!existingStudent)");
  });

  test("cooldown de reenvio (confirmation_pending) retorna antes de qualquer rastreamento — não duplica sinal", () => {
    const source = read(EVENT_ROUTE);
    const cooldownReturnIndex = source.indexOf('state: "confirmation_pending"');
    const trackingIndex = source.indexOf("startOrTouchEventRegistrationAttempt(supabase, { email, eventId: event.id })");
    expect(cooldownReturnIndex).toBeGreaterThan(-1);
    expect(cooldownReturnIndex).toBeLessThan(trackingIndex);
  });
});

test.describe("2. Serviço — enriquecimento sem perder dados já coletados", () => {
  test("startOrTouchEventRegistrationAttempt existe, nunca lança, e aceita apenas email + eventId", () => {
    const source = read(ATTEMPT_SERVICE);
    expect(source).toContain("export async function startOrTouchEventRegistrationAttempt(");
    expect(source).toContain("input: { email: string; eventId: string }");
    expect(source).toMatch(/startOrTouchEventRegistrationAttempt[\s\S]*?try \{[\s\S]*?\} catch \(error\) \{/);
  });

  test("lê a tentativa existente por email_normalized (nunca status completed) antes de decidir o full_name/phone a enviar", () => {
    const source = read(ATTEMPT_SERVICE);
    const start = source.indexOf("export async function startOrTouchEventRegistrationAttempt(");
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).toContain('.from("student_registration_attempts")');
    expect(body).toContain('.eq("email_normalized", emailNormalized)');
    expect(body).toContain('.neq("status", "completed")');
  });

  test("preserva full_name/phone já conhecidos (nunca sobrescreve com vazio) e usa source event_signup", () => {
    const source = read(ATTEMPT_SERVICE);
    const start = source.indexOf("export async function startOrTouchEventRegistrationAttempt(");
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).toContain('fullName: existing?.full_name || ""');
    expect(body).toContain("phone: existing?.phone ?? null");
    expect(body).toContain('source: "event_signup"');
    expect(body).toContain("sourceContextId: input.eventId");
  });

  test('RegistrationAttemptSource já incluía "event_signup" antes desta Sprint (nenhuma migration nova necessária para origem)', () => {
    const source = read(ATTEMPT_SERVICE);
    expect(source).toContain('export type RegistrationAttemptSource = "public_signup" | "event_signup";');
  });

  test("nenhuma migration nova foi criada nesta Sprint — campos source/source_context_id já existiam", () => {
    const dir = path.join(root, "supabase", "migrations");
    const files = fs.readdirSync(dir);
    // As duas únicas migrations da Sprint de cadastro (anterior a esta) já
    // existiam antes desta tarefa começar — nenhuma migration nova deve
    // ter sido adicionada para a integração com Evento.
    const knownBefore = [
      "20260910100000_student_registration_attempts.sql",
      "20260910120000_remove_completed_registration_attempts.sql",
    ];
    const registrationAttemptMigrations = files.filter((f) => f.includes("registration_attempt"));
    expect(registrationAttemptMigrations.sort()).toEqual(knownBefore.sort());
  });
});

test.describe("3. UI — falha de tracking nunca aparece para o usuário do Evento", () => {
  test("a chamada de tracking no Evento não usa await em bloco que retorne erro ao cliente (best-effort dentro do próprio serviço)", () => {
    const source = read(EVENT_ROUTE);
    // A função de serviço absorve erro internamente (try/catch) — a rota do
    // Evento só faz "await" simples, sem seu próprio try/catch adicional,
    // porque a garantia de nunca lançar já vem de dentro do serviço.
    const callLine = source.split("\n").find((line) => line.includes("startOrTouchEventRegistrationAttempt(supabase"));
    expect(callLine).toBeTruthy();
    expect(callLine).not.toContain(".catch(");
  });
});

test.describe("4. Campo Busca — causa raiz do retângulo preto corrigida", () => {
  test("Central de Tentativas: input de busca não fica mais dentro de wrapper com bg divergente do CSS global forçado", () => {
    const source = read(PANEL);
    // O antigo wrapper com fundo próprio (#0D1926) + input "bg-transparent"
    // por dentro é exatamente a causa do retângulo: o CSS global força
    // background-color #050b13 !important só no <input>, nunca no wrapper.
    expect(source).not.toMatch(/<input className="min-w-0 flex-1 bg-transparent/);
    expect(source).toContain('placeholder="Nome, e-mail ou telefone"');
    expect(source).toMatch(/pointer-events-none absolute left-4 top-1\/2 -translate-y-1\/2 text-slate-500/);
    // O <input> agora é a própria caixa (h-12, borda, radius) — sem wrapper
    // com bg-[#0D1926] próprio disputando com o CSS global.
    const placeholderIndex = source.indexOf('placeholder="Nome, e-mail ou telefone"');
    const inputBlock = source.slice(Math.max(0, placeholderIndex - 400), placeholderIndex);
    expect(inputBlock).toContain("h-12 w-full rounded-2xl");
    expect(inputBlock).not.toContain("bg-[#0D1926]");
  });

  test("admin/logs: FilterInput segue o mesmo padrão corrigido (input dono da própria caixa, ícone posicionado por cima)", () => {
    const source = read(LOGS_PANEL);
    const start = source.indexOf("function FilterInput(");
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).not.toContain("bg-[#0D1926]");
    expect(body).not.toMatch(/<input className="min-w-0 flex-1 bg-transparent/);
    expect(body).toMatch(/absolute left-4 top-1\/2 -translate-y-1\/2 text-slate-500/);
    expect(body).toContain("h-12 w-full rounded-2xl");
  });
});

test.describe("5. Dropdowns — Central de Tentativas sem <select> nativo visível", () => {
  test("FilterSelect nativo foi removido do arquivo", () => {
    const source = read(PANEL);
    expect(source).not.toContain("function FilterSelect");
    expect(source).not.toMatch(/<select\b/);
  });

  test("Situação/Etapa/Período usam PremiumSimpleSelect (dropdown customizado)", () => {
    const source = read(PANEL);
    expect(source).toContain('import PremiumSimpleSelect from "@/app/components/ui/PremiumSimpleSelect";');
    expect(source).toContain('<PremiumSimpleSelect dark label="Situação"');
    expect(source).toContain('<PremiumSimpleSelect dark label="Etapa"');
    expect(source).toContain('<PremiumSimpleSelect dark label="Período"');
  });

  test("PremiumSimpleSelect nunca renderiza <select> nativo e cobre teclado (Escape/Enter/setas) + click outside", () => {
    const source = read(SIMPLE_SELECT);
    // Remove linhas de comentário antes de checar por uma tag <select> real
    // (o próprio arquivo menciona "<select>" em prosa dentro de comentários).
    const codeOnly = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(codeOnly).not.toMatch(/<select[\s>]/);
    expect(codeOnly).toContain("<button");
    expect(source).toContain('"Escape"');
    expect(source).toContain('"Enter"');
    expect(source).toContain('"ArrowDown"');
    expect(source).toContain('"ArrowUp"');
    expect(source).toContain("mousedown");
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain('aria-expanded');
    expect(source).toContain('aria-haspopup="listbox"');
  });

  test("PremiumSimpleSelect não fixa opções de status/valores — recebe options por prop, não altera regra de negócio", () => {
    const source = read(SIMPLE_SELECT);
    expect(source).toContain("options: readonly PremiumSimpleSelectOption[]");
    expect(source).not.toMatch(/"open"|"contacted"|"ignored"/);
  });
});

test.describe("6. Fallback visual de nome/telefone ausentes (tentativa originada em Evento)", () => {
  test("displayFullName nunca renderiza string vazia crua", () => {
    const source = read(PANEL);
    expect(source).toContain("function displayFullName(attempt: Attempt)");
    expect(source).toContain('return attempt.full_name.trim() || "—";');
    expect(source).toContain("{displayFullName(attempt)}");
    expect(source).toContain("title={displayFullName(attempt)}");
  });

  test("modal de detalhe exibe Origem (Evento / Cadastro geral)", () => {
    const source = read(PANEL);
    expect(source).toMatch(/label="Origem" value=\{attempt\.source === "event_signup" \? "Evento" : "Cadastro geral"\}/);
  });
});
