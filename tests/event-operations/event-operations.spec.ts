import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("effective status is computed from real timestamps and drives auto start/close everywhere critical", () => {
  const simuladoEvents = read("lib/server/simuladoEvents.ts");
  expect(simuladoEvents).toContain('export function effectiveEventStatus(event:');
  expect(simuladoEvents).toContain('if (event.status === "closed" || new Date(event.ends_at).getTime() <= now) return "closed";');
  expect(simuladoEvents).toContain('if (event.status === "active" || event.started_at || new Date(event.starts_at).getTime() <= now) return "active";');

  const eventRoute = read("app/api/events/[slug]/route.ts");
  expect(eventRoute).toContain('effectiveEventStatus(event) !== "scheduled"');

  const professorRoute = read("app/api/professor/events/[id]/route.ts");
  expect(professorRoute).toContain("effectiveEventStatus(event)");
});

test("status-job cron reconciles status idempotently without overriding manual actions", () => {
  const job = read("app/api/admin/events/status-job/route.ts");
  expect(job).toContain("verifyCronSecret(request)");
  // Auto start: nunca sobrescreve um evento que já não está mais 'scheduled'.
  expect(job).toContain('.eq("status", "scheduled")');
  expect(job).toContain('started_at: event.started_at || now');
  // Auto close: nunca toca em closed/archived de novo.
  expect(job).toContain('.not("status", "in", "(closed,archived)")');
  expect(job).toContain('closed_at: event.closed_at || now');
  // Confirma sucesso por presença de linha, não por ausência de erro.
  expect(job).toContain('.select("id")\n        .maybeSingle();');
});

test("vercel.json keeps exactly two daily cron jobs, matching the Hobby plan constraint", () => {
  const vercelConfig = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
  expect(vercelConfig.crons).toHaveLength(2);
  expect(vercelConfig.crons.map((cron) => cron.path)).toEqual([
    "/api/admin/jornadas/release-job",
    "/api/admin/events/status-job",
  ]);
  for (const cron of vercelConfig.crons) {
    expect(cron.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  }
});

test("reminder is exclusively manual — no automatic window, no automatic source, no scheduler helper survives in the codebase", () => {
  const reminders = read("lib/server/eventReminders.ts");
  expect(reminders).toContain("export const REMINDER_COOLDOWN_HOURS = 6;");
  expect(reminders).not.toContain("isWithinAutomaticReminderWindow");
  expect(reminders).not.toContain("automatic");
  expect(reminders).not.toContain('"suppressed"');
  expect(reminders).not.toContain('"automatic" | "manual"');
  // Cooldown lido do último envio bem-sucedido do EVENTO, não por participante.
  expect(reminders).toContain('.eq("status", "sent")');
  expect(reminders).toContain('.order("completed_at", { ascending: false })');

  const job = read("app/api/admin/events/status-job/route.ts");
  expect(job).not.toContain("sendEventReminderBatch");
  expect(job).not.toContain('from "@/lib/server/eventReminders"');
  expect(job).not.toContain("recipients_total");
});

test("reminder send reserves an in-flight lock before touching participants, protecting against duplicate/concurrent operations", () => {
  const reminders = read("lib/server/eventReminders.ts");
  const staleCheckIndex = reminders.indexOf("const { excludeStudentIds } = await reconcileStaleSending");
  const activeSendingCheckIndex = reminders.indexOf('.eq("status", "sending")', staleCheckIndex);
  const reserveIndex = reminders.indexOf('.insert({ event_id: event.id, status: "sending", triggered_by: triggeredBy })');
  const participantsQueryIndex = reminders.indexOf('from("simulado_event_participants")', reserveIndex);
  expect(staleCheckIndex).toBeGreaterThan(-1);
  expect(activeSendingCheckIndex).toBeGreaterThan(staleCheckIndex);
  expect(reserveIndex).toBeGreaterThan(activeSendingCheckIndex);
  expect(participantsQueryIndex).toBeGreaterThan(reserveIndex);

  const migration = read("supabase/migrations/20260904140000_create_simulado_event_reminders.sql");
  expect(migration).toContain("create unique index if not exists unique_simulado_event_reminders_inflight");
  expect(migration).toContain("where status = 'sending';");
  expect(migration).toContain("check (status in ('sending', 'sent', 'failed'))");
  expect(migration).not.toContain("source");
  expect(migration.startsWith("begin;")).toBe(true);
  expect(migration.trim().endsWith("commit;")).toBe(true);
});

test("a genuine unique-violation is the ONLY error treated as 'in progress' — any other insert error (missing table, permission, network) is reported honestly instead", () => {
  const reminders = read("lib/server/eventReminders.ts");
  expect(reminders).toContain('const POSTGRES_UNIQUE_VIOLATION = "23505";');
  const reserveErrorIndex = reminders.indexOf("if (reserveError) {");
  const codeCheckIndex = reminders.indexOf("reserveError.code === POSTGRES_UNIQUE_VIOLATION", reserveErrorIndex);
  const inProgressIndex = reminders.indexOf('return { ok: false, state: "in_progress" };', reserveErrorIndex);
  const fallbackErrorIndex = reminders.indexOf('state: "error", message: "Não foi possível registrar o envio agora."', reserveErrorIndex);
  expect(reserveErrorIndex).toBeGreaterThan(-1);
  expect(codeCheckIndex).toBeGreaterThan(reserveErrorIndex);
  expect(inProgressIndex).toBeGreaterThan(codeCheckIndex);
  expect(fallbackErrorIndex).toBeGreaterThan(inProgressIndex);
  // O erro real (ex.: tabela inexistente) é logado, nunca engolido em silêncio.
  expect(reminders.slice(reserveErrorIndex, fallbackErrorIndex + 200)).toContain('logSystemError({ source: "api.admin.events.reminder.reserve"');
});

test("a stale 'sending' row (older than the lease) is reconciled to failed on demand — no cron involved — and its already-sent recipients are excluded from the next batch", () => {
  const reminders = read("lib/server/eventReminders.ts");
  expect(reminders).toContain("export const STALE_SENDING_MINUTES = 5;");
  expect(reminders).toContain("async function reconcileStaleSending(supabase: SupabaseClient, eventId: string)");
  const fnBody = reminders.slice(reminders.indexOf("async function reconcileStaleSending"), reminders.indexOf("export async function getReminderStatusInfo"));
  expect(fnBody).toContain("ageMinutes < STALE_SENDING_MINUTES");
  expect(fnBody).toContain('reason: "stale_sending_recovered"');
  expect(fnBody).toContain('.eq("status", "sending")'); // guarda condicional, nunca reconcilia um envio genuíno
  expect(fnBody).toContain('.eq("status", "sent")'); // recipients já enviados pelo lote abandonado
  expect(fnBody).not.toContain(".delete("); // nunca apaga recipients já enviados

  const jobsFile = read("app/api/admin/events/status-job/route.ts");
  expect(jobsFile).not.toContain("reconcileStaleSending");
  expect(jobsFile).not.toContain("sendEventReminderBatch");
});

test("a failed reminder attempt never starts the cooldown, only a successful one does, and a blocked click never touches the ledger", () => {
  const reminders = read("lib/server/eventReminders.ts");
  const finalStatusIndex = reminders.indexOf('const finalStatus = sentCount > 0 ? "sent" : "failed";');
  expect(finalStatusIndex).toBeGreaterThan(-1);
  // getReminderStatusInfo só considera status = 'sent' — 'failed' nunca
  // aparece no cálculo de next_available_at.
  const statusFnIndex = reminders.indexOf("export async function getReminderStatusInfo");
  const statusFn = reminders.slice(statusFnIndex, statusFnIndex + 900);
  expect(statusFn).toContain('.eq("status", "sent")');
  expect(statusFn).not.toContain('"failed"');

  // Cooldown bloqueado responde e retorna, sem nenhuma escrita no ledger antes disso.
  const cooldownCheckIndex = reminders.indexOf('if (status.state === "cooldown" && status.nextAvailableAt) {');
  const blockedReturnIndex = reminders.indexOf('return { ok: false, state: "blocked"', cooldownCheckIndex);
  const firstInsertIndex = reminders.indexOf(".insert(");
  expect(cooldownCheckIndex).toBeGreaterThan(-1);
  expect(blockedReturnIndex).toBeGreaterThan(cooldownCheckIndex);
  expect(firstInsertIndex).toBeGreaterThan(blockedReturnIndex);
});

test("a successful partial batch (some sent, some failed) still starts the cooldown — matches the audited existing semantics, unchanged by this fix", () => {
  const reminders = read("lib/server/eventReminders.ts");
  expect(reminders).toContain('const finalStatus = sentCount > 0 ? "sent" : "failed";');
});

test("an unexpected exception after reserving the batch is caught and the ledger is closed as failed instead of staying sending forever", () => {
  const reminders = read("lib/server/eventReminders.ts");
  const outerTryIndex = reminders.indexOf("try {", reminders.indexOf("const reminderId = reservedReminder.id"));
  const unexpectedCatchIndex = reminders.indexOf('markFailed(supabase, reminderId, "unexpected_exception")');
  const catchBody = reminders.slice(Math.max(0, unexpectedCatchIndex - 200), unexpectedCatchIndex + 300);
  expect(outerTryIndex).toBeGreaterThan(-1);
  expect(unexpectedCatchIndex).toBeGreaterThan(outerTryIndex);
  expect(catchBody).toContain("} catch (error) {");
  expect(catchBody).toContain('logSystemError({ source: "api.admin.events.reminder.unexpected"');
});

test("manual reminder endpoint is admin-only, blocks outside scheduled status, and revalidates cooldown server-side", () => {
  const adminEventRoute = read("app/api/admin/events/[id]/route.ts");
  expect(adminEventRoute).toContain('requireAdmin(request)');
  expect(adminEventRoute).toContain('body.action === "send_reminder"');
  expect(adminEventRoute).toContain("eventAcceptsReminder(current)");
  expect(adminEventRoute).toContain('sendEventReminderBatch(supabase, current, admin.id, request)');
  expect(adminEventRoute).toContain('result.state === "blocked"');
  expect(adminEventRoute).toContain('result.state === "in_progress"');
  expect(adminEventRoute).toContain("status: 429");
  // GET expõe o estado de 3 valores calculado por getReminderStatusInfo,
  // sempre reconciliando stale antes de responder.
  expect(adminEventRoute).toContain("getReminderStatusInfo(supabase, id)");
  expect(adminEventRoute).toContain("state: reminderStatus.state");

  const professorEventRoute = read("app/api/professor/events/[id]/route.ts");
  expect(professorEventRoute).not.toContain("send_reminder");

  const reminders = read("lib/server/eventReminders.ts");
  expect(reminders).toContain('export function eventAcceptsReminder(event: EventRow): boolean {');
  expect(reminders).toContain('return effectiveEventStatus(event) === "scheduled" && Boolean(event.simulado_id);');
});

test("the UI recognizes three distinct reminder states — available, cooldown and sending — and only the cooldown countdown ticks", () => {
  const reminderButton = read("app/admin/eventos/[id]/ReminderButton.tsx");
  expect(reminderButton).toContain('state: "available" | "cooldown" | "sending";');
  expect(reminderButton).toContain('const isCooldown = reminder.state === "cooldown";');
  expect(reminderButton).toContain('const isSendingInProgress = reminder.state === "sending";');
  expect(reminderButton).toContain("const isDisabled = isCooldown || isSendingInProgress;");
  expect(reminderButton).toContain("Envio de lembrete em andamento...");
  expect(reminderButton).toContain("window.setInterval(() => setNow(Date.now()), 1000)");
  expect(reminderButton).toContain("if (!isCooldown) return;"); // só conta regressiva em cooldown, não em sending
  expect(reminderButton).toContain("disabled={isDisabled}");
  // Botão continua visível em ambos os estados bloqueados — nunca escondido.
  expect(reminderButton).not.toMatch(/isDisabled\s*&&\s*return null/);
  // Clique é defensivo: nunca abre o modal fora do estado available.
  expect(reminderButton).toContain("if (!isDisabled) setConfirming(true);");
});

test("the admin page polls while sending, to detect completion without a refresh, reusing the existing load() — no WebSocket", () => {
  const adminEventClient = read("app/admin/eventos/[id]/page-client.tsx");
  const pollEffectIndex = adminEventClient.indexOf('if (reminder?.state !== "sending") return;');
  expect(pollEffectIndex).toBeGreaterThan(-1);
  expect(adminEventClient.slice(pollEffectIndex, pollEffectIndex + 200)).toContain("window.setInterval(() => void load()");
  // sendReminder sempre recarrega do servidor, sucesso ou falha — nunca
  // infere o próximo estado localmente a partir da resposta de um clique.
  expect(adminEventClient).toContain("async function sendReminder() {");
});

test("manual reminder confirmation modal informs eligible recipient count before sending", () => {
  const reminderButton = read("app/admin/eventos/[id]/ReminderButton.tsx");
  expect(reminderButton).toContain('title="Enviar lembrete agora?"');
  expect(reminderButton).toContain("participante(s) elegível(is) receberão este lembrete");
});

test("admin can reach the same operational panel used by professors, without a duplicated dashboard or a fake professor assignment", () => {
  const authGuard = read("lib/server/authGuard.ts");
  expect(authGuard).toContain("export async function requireEventManagerPage(eventId: string)");
  expect(authGuard).toContain('if (profile?.role === "admin" && profile.is_active) return { id: user.id, role: "admin" };');

  const professorEventPage = read("app/professor/eventos/[id]/page.tsx");
  expect(professorEventPage).toContain("requireEventManagerPage(id)");
  expect(professorEventPage).not.toContain("requireProfessorPage");

  const professorPreviewPage = read("app/professor/eventos/[id]/preview/page.tsx");
  expect(professorPreviewPage).toContain("requireEventManagerPage(id)");

  const adminEventClient = read("app/admin/eventos/[id]/page-client.tsx");
  expect(adminEventClient).toContain("Acompanhar Evento");
  // Nova guia, sem substituir a página Admin atual, e com o marcador de rota
  // "popup" que o AppShell já usa para não renderizar nenhum chrome.
  expect(adminEventClient).toContain('href={`/professor/eventos/${id}?popup=1`}');
  expect(adminEventClient).toContain('target="_blank"');
  expect(adminEventClient).toContain('rel="noopener noreferrer"');

  const premiumButton = read("app/components/ui/PremiumButton.tsx");
  expect(premiumButton).toContain("target={target}");
  expect(premiumButton).toContain("rel={rel}");
});

test("the popup route never renders Admin sidebar, header or menus — reuses the existing chrome-free mechanism, no new layout was created", () => {
  const appShell = read("app/components/AppShell.tsx");
  const popupDetectionIndex = appShell.indexOf('new URLSearchParams(window.location.search).get("popup") === "1"');
  const bareRenderIndex = appShell.indexOf("if (isPopupRoute || isPublicRoute || isFocusRoute || isPublicViewRoute) {");
  expect(popupDetectionIndex).toBeGreaterThan(-1);
  expect(bareRenderIndex).toBeGreaterThan(popupDetectionIndex);
  // Renderiza só os children — nenhuma sidebar/header/menu, admin ou não.
  expect(appShell.slice(bareRenderIndex, bareRenderIndex + 120)).toContain("return <>{children}</>;");

  // A própria dashboard operacional não depende de nenhuma classe
  // et-teacher-*/teacher-theme para seu visual — permanece idêntica com ou
  // sem o wrapper do AppShell.
  const professorEventClient = read("app/professor/eventos/[id]/page-client.tsx");
  expect(professorEventClient).not.toContain("et-teacher-");
  expect(professorEventClient).not.toContain("teacher-theme");
});

test("professor without an assignment to this event is still rejected by the operational panel guard", () => {
  const authGuard = read("lib/server/authGuard.ts");
  const guardStart = authGuard.indexOf("export async function requireEventManagerPage");
  const guardBody = authGuard.slice(guardStart, guardStart + 1200);
  expect(guardBody).toContain('from("simulado_event_professors").select("id").eq("event_id", eventId).eq("professor_id", user.id)');
  expect(guardBody).toContain("if (!assignment) redirect(\"/login\");");
});

test("exactly one relevant event sends the student straight to it; more than one always goes to /meus-eventos", () => {
  const studentNav = read("lib/student-nav.ts");
  expect(studentNav).toContain('if (access?.eventDestination.type === "single") return `/meus-eventos/${access.eventDestination.eventId}`;');
  expect(studentNav).toContain('if (access?.eventDestination.type === "multiple") return "/meus-eventos";');

  const navAccessRoute = read("app/api/student/nav-access/route.ts");
  expect(navAccessRoute).toContain("effectiveEventStatus(event)");
  expect(navAccessRoute).toContain('.filter((event) => event.effective_status === "active" || event.effective_status === "scheduled")');
  const singleIndex = navAccessRoute.indexOf('type: "single" as const');
  const multipleIndex = navAccessRoute.indexOf('type: "multiple" as const');
  expect(singleIndex).toBeGreaterThan(-1);
  expect(multipleIndex).toBeGreaterThan(singleIndex);
});

test("closed and archived events never count toward the student's initial destination priority", () => {
  const navAccessRoute = read("app/api/student/nav-access/route.ts");
  const filterIndex = navAccessRoute.indexOf(".filter((event) => event.effective_status");
  expect(filterIndex).toBeGreaterThan(-1);
  expect(navAccessRoute.slice(filterIndex, filterIndex + 120)).not.toContain("closed");
  expect(navAccessRoute.slice(filterIndex, filterIndex + 120)).not.toContain("archived");
});

test("login page and AuthContext both resolve the student destination through the single lib/student-nav.ts source", () => {
  const loginPage = read("app/login/page.tsx");
  expect(loginPage).toContain("studentHomePath({");
  expect(loginPage).toContain("navAccessResult.event_destination");

  const authContext = read("app/contexts/AuthContext.tsx");
  expect(authContext).toContain("json.event_destination?.type");
});

test("meus-eventos ranks active first, then scheduled by nearest starts_at, and highlights exactly one priority card", () => {
  const meusEventos = read("app/meus-eventos/page-client.tsx");
  expect(meusEventos).toContain("function sortEventRows(rows: Row[]): Row[] {");
  expect(meusEventos).toContain('const rank = (status: string) => (status === "active" ? 0 : status === "scheduled" ? 1 : 2);');
  expect(meusEventos).toContain("new Date(left.simulado_events.starts_at).getTime() - new Date(right.simulado_events.starts_at).getTime()");
  expect(meusEventos).toContain("function priorityEventId(rows: Row[]): string | null {");
  expect(meusEventos).toContain('isPriority={row.id === priorityEventId(rows)}');

  const globalCss = read("app/globals.css");
  expect(globalCss).toContain(".student-journey-card--priority {");
});

test("admin's joined-participants list is searchable and always sorted A→Z with a stable tiebreak", () => {
  const adminEventClient = read("app/admin/eventos/[id]/page-client.tsx");
  expect(adminEventClient).toContain("const [existingParticipantSearch, setExistingParticipantSearch] = useState");
  expect(adminEventClient).toContain("const sortedParticipants = useMemo(");
  expect(adminEventClient).toContain('localeCompare(right.students?.name || "", "pt-BR", { sensitivity: "base" })');
  expect(adminEventClient).toContain("return left.id.localeCompare(right.id);");
  expect(adminEventClient).toContain("sortedParticipants.map((participant)");
  // Busca é somente visual: nenhuma chamada de rede dentro do memo de busca.
  const memoStart = adminEventClient.indexOf("const sortedParticipants = useMemo(");
  const memoEnd = adminEventClient.indexOf("}, [participants, existingParticipantSearch]);");
  expect(adminEventClient.slice(memoStart, memoEnd)).not.toContain("fetch(");
  expect(adminEventClient.slice(memoStart, memoEnd)).not.toContain("adminFetch(");
});

test("reminder email content includes event name, start date/time, Brasília timezone label, professors and a CTA", () => {
  const templates = read("lib/email/studentRegistrationTemplates.ts");
  expect(templates).toContain("export function eventReminderTemplate({ eventName, startsAtLabel, professorNames, eventUrl }: EventReminderEmailProps) {");
  expect(templates).toContain("Horário de Brasília");
  expect(templates).toContain("Ver meu Evento");
  expect(templates).toContain("professorNames.length > 1 ? \"Professores\" : \"Professor\"");
});

test("reminder recipients are limited to active students who are real participants of this event", () => {
  const reminders = read("lib/server/eventReminders.ts");
  const eligibleIndex = reminders.indexOf("const eligible = (participants || [])");
  expect(eligibleIndex).toBeGreaterThan(-1);
  expect(reminders.slice(eligibleIndex, eligibleIndex + 400)).toContain('student.status === "active"');
});
