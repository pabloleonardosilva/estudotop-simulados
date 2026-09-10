import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/server/cronAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { completeSimuladoAttempt } from "@/lib/server/simuladoAttemptCompletion";

// Job diário único (Vercel Cron no plano Hobby só permite 1x/dia por job,
// mesmo padrão de app/api/admin/events/status-job/route.ts e
// app/api/admin/jornadas/release-job/route.ts) que encerra server-side
// tentativas cronometradas cujo `expires_at` já passou e cujo aluno nunca
// mais voltou à página (o timeout com a página aberta e a retomada de
// attempt vencida já são resolvidos em tempo real — ver
// app/meus-simulados/[id]/page-client.tsx e
// app/api/student/simulados/[id]/attempts/route.ts — este job é
// exclusivamente a rede de segurança para quando o aluno nunca retorna).
//
// Atraso máximo esperado: como o job roda no máximo 1x/dia, uma tentativa
// pode ficar até ~24h além do próprio expires_at antes de ser fechada
// automaticamente por aqui (documentado, não escondido — ver
// docs/Sprint-simulados.md). Isso não afeta a nota: `save_student_attempt_answer`
// já rejeita, pelo relógio do Postgres, qualquer resposta registrada após
// expires_at — o atraso do job não permite nenhuma resposta adicional, só
// atrasa quando o estado passa a `completed`.
//
// Reaproveita 100% a mesma engine de conclusão do submit manual/timeout com
// página aberta — completeSimuladoAttempt() (lib/server/simuladoAttemptCompletion.ts).
// Nenhum scoring, RPC ou pós-processamento (representative/result
// release/TopCoins/e-mails/logs) é duplicado aqui.
//
// MARCO DE ATIVAÇÃO (documentado, não é um valor mágico escondido): só
// processa tentativas cujo `expires_at` é >= este timestamp. Existe uma
// população histórica de 18 tentativas (`status=in_progress AND
// expires_at<now()`, ver docs/status-atual.md "Encerramento compulsório por
// tempo esgotado") que precede esta funcionalidade e que NÃO deve ser
// processada automaticamente no primeiro deploy — inclui a tentativa da
// aluna Luciana Cabral Jacinto e 2 outras com representative_attempt_id/
// result_released_at incorretos, todas reservadas para reconciliação manual
// separada. Este marco garante que nenhuma delas seja tocada por este job:
// todas têm expires_at estritamente anterior a este valor.
const AUTO_TIMEOUT_ACTIVATION_AT = "2026-09-10T18:20:00.000Z";

// Contextos elegíveis para fechamento automático: Evento e Jornada. Tentativas
// "standalone" pararam de poder ser criadas (app/api/student/simulados/[id]/attempts/route.ts
// rejeita esse contexto com 400) — as 7 standalone vencidas no banco hoje são
// 100% legado pré-restrição; mesmo sem o marco de ativação já as excluir
// (todas têm expires_at no passado), este filtro é uma segunda camada
// explícita e intencional: nenhuma nova standalone pode surgir para ser
// processada, e nenhuma legada é tocada por engano.
const ELIGIBLE_CONTEXTS = ["event", "jornada"];

// Lote por execução — nunca processa a tabela inteira de uma vez. Suficiente
// para o volume observado (a população elegível é, por desenho, pequena:
// só quem nunca mais voltou à página) sem arriscar timeout da function.
const BATCH_SIZE = 50;

type CandidateAttemptRow = {
  id: string;
  student_id: string;
  simulado_id: string;
  expires_at: string;
  updated_at: string;
  event_participant_id: string | null;
  event_id: string | null;
  student_jornada_simulado_id: string | null;
  settings_snapshot: unknown;
  started_at: string;
  attempt_context: string;
  students: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
};

export async function GET(request: Request) {
  const cronError = verifyCronSecret(request);
  if (cronError) return cronError;

  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  let completed = 0;
  let alreadyTerminal = 0;
  let failed = 0;

  try {
    const { data: candidates, error } = await supabase
      .from("simulado_attempts")
      .select(
        "id,student_id,simulado_id,expires_at,updated_at,event_participant_id,event_id,student_jornada_simulado_id,settings_snapshot,started_at,attempt_context,students:student_id(name,email)",
      )
      .eq("status", "in_progress")
      .eq("is_preview", false)
      .in("attempt_context", ELIGIBLE_CONTEXTS)
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso)
      .gte("expires_at", AUTO_TIMEOUT_ACTIVATION_AT)
      .order("expires_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    const rows = (candidates || []) as unknown as CandidateAttemptRow[];

    for (const row of rows) {
      const studentRef = Array.isArray(row.students) ? row.students[0] || null : row.students;
      const timeSpentSeconds = Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000));

      try {
        const result = await completeSimuladoAttempt(supabase, {
          attempt: row,
          studentId: row.student_id,
          studentName: studentRef?.name ?? null,
          studentEmail: studentRef?.email ?? null,
          simuladoId: row.simulado_id,
          timeSpentSeconds,
          origin: "timeout_cron",
          request,
        });

        if (result.ok) {
          completed++;
        } else if (result.httpStatus === 409) {
          // Concorrência esperada: outra execução (client submit, retry, ou
          // este mesmo job rodando de novo) já fechou a tentativa entre a
          // seleção e esta chamada. Estado terminal, não é falha.
          alreadyTerminal++;
        } else {
          failed++;
          void logSystemError({
            source: "api.admin.simulados.attempts_timeout_job.attempt",
            error: new Error(result.message),
            request,
            metadata: { attempt_id: row.id, http_status: result.httpStatus },
          });
        }
      } catch (attemptError) {
        // Isola falha por tentativa: uma linha com problema nunca interrompe
        // o restante do lote. Fica elegível para a próxima execução (não é
        // removida de "in_progress", então volta a aparecer na próxima
        // consulta) — sem mecanismo de retry próprio além disso.
        failed++;
        void logSystemError({
          source: "api.admin.simulados.attempts_timeout_job.attempt",
          error: attemptError,
          request,
          metadata: { attempt_id: row.id },
        });
      }
    }

    void logAdminAction({
      action: "admin.cron.attempts_timeout_job.finished",
      entityType: "cron",
      entityId: "attempts-timeout-job",
      request,
      metadata: {
        candidates_count: rows.length,
        completed_count: completed,
        already_terminal_count: alreadyTerminal,
        failed_count: failed,
        duration_ms: Date.now() - startedAt,
      },
    });

    // Resposta nunca inclui PII (nome/e-mail/CPF de aluno) — só contadores.
    return NextResponse.json({
      ok: true,
      processed: rows.length,
      completed,
      already_terminal: alreadyTerminal,
      failed,
      message: `Job executado: ${completed} tentativa(s) encerrada(s) por timeout, ${alreadyTerminal} já estava(m) em estado terminal, ${failed} falha(s).`,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.simulados.attempts_timeout_job", error, request, metadata: { duration_ms: Date.now() - startedAt } });
    return NextResponse.json(
      { ok: false, message: "Não foi possível executar o job de encerramento por timeout." },
      { status: 500 },
    );
  }
}
