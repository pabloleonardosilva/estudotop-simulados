import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/server/cronAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

// Job diário único (Vercel Cron no plano Hobby só permite 1x/dia por job) que
// reconcilia o status persistido dos Eventos por horário. A imposição de
// acesso real (quem pode entrar, iniciar tentativa etc.) NUNCA depende deste
// job — já é garantida em tempo real por effectiveEventStatus() em cada rota
// crítica. Este job só existe para manter status/started_at/closed_at
// persistidos coerentes com a realidade, mesmo sem nenhuma ação manual e sem
// nenhuma página aberta. Toda escrita é condicional (idempotente) e nunca
// sobrescreve um estado já definido manualmente.
//
// Este job NÃO envia lembrete: lembrete de Evento é exclusivamente manual
// (decisão de produto de 2026-09-04) — ver lib/server/eventReminders.ts e
// "Enviar lembrete agora" em app/admin/eventos/[id].
export async function GET(request: Request) {
  const cronError = verifyCronSecret(request);
  if (cronError) return cronError;

  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  let autoStarted = 0;
  let autoClosed = 0;
  let errors = 0;

  try {
    // Auto-início: só eventos ainda 'scheduled' com Simulado vinculado cujo
    // starts_at já passou e ends_at ainda não — nunca toca em quem já foi
    // iniciado manualmente (status já não seria 'scheduled') nem sobrescreve
    // started_at se, por alguma corrida, já tiver sido setado.
    const { data: toStart, error: toStartError } = await supabase
      .from("simulado_events")
      .select("id,started_at")
      .eq("status", "scheduled")
      .not("simulado_id", "is", null)
      .lte("starts_at", now)
      .gt("ends_at", now);
    if (toStartError) throw toStartError;
    for (const event of toStart || []) {
      const { data: started, error: startError } = await supabase
        .from("simulado_events")
        .update({ status: "active", started_at: event.started_at || now })
        .eq("id", event.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (startError) { errors++; continue; }
      if (started) {
        autoStarted++;
        void logAdminAction({ action: "admin.cron.event_auto_started", entityType: "simulado_event", entityId: event.id, request });
      }
    }

    // Auto-encerramento: qualquer evento ainda não closed/archived cujo
    // ends_at já passou. Preserva closed_at se já setado (nunca deveria
    // estar, dado o filtro abaixo, mas o COALESCE evita sobrescrever em
    // qualquer corrida residual).
    const { data: toClose, error: toCloseError } = await supabase
      .from("simulado_events")
      .select("id,closed_at")
      .not("status", "in", "(closed,archived)")
      .lte("ends_at", now);
    if (toCloseError) throw toCloseError;
    for (const event of toClose || []) {
      const { data: closed, error: closeError } = await supabase
        .from("simulado_events")
        .update({ status: "closed", closed_at: event.closed_at || now })
        .eq("id", event.id)
        .not("status", "in", "(closed,archived)")
        .select("id")
        .maybeSingle();
      if (closeError) { errors++; continue; }
      if (closed) {
        autoClosed++;
        void logAdminAction({ action: "admin.cron.event_auto_closed", entityType: "simulado_event", entityId: event.id, request });
      }
    }

    void logAdminAction({
      action: "admin.cron.event_status_job.finished",
      entityType: "cron",
      entityId: "events-status-job",
      request,
      metadata: { auto_started: autoStarted, auto_closed: autoClosed, errors, duration_ms: Date.now() - startedAt },
    });

    return NextResponse.json({
      ok: true,
      auto_started: autoStarted,
      auto_closed: autoClosed,
      message: `Job executado: ${autoStarted} evento(s) iniciado(s), ${autoClosed} encerrado(s).`,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.events.status_job", error, request, metadata: { duration_ms: Date.now() - startedAt } });
    return NextResponse.json({ ok: false, message: "Não foi possível executar o job de status do Evento." }, { status: 500 });
  }
}
