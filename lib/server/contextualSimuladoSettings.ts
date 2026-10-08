import "server-only";
import type { createSupabaseAdminClient } from "./supabaseAdmin";
import type { AttemptExecutionContext } from "./studentAssertions";

export type ContextualSimuladoSettings = {
  feedback_mode: "instant" | "final_only";
  navigation_override: "open" | "closed" | null;
  owl_help_enabled: boolean;
  owl_help_limit: number | null;
};

export function parseContextualSettings(body: Record<string, unknown>, current?: ContextualSimuladoSettings): ContextualSimuladoSettings {
  const feedback = body.feedback_mode ?? current?.feedback_mode ?? "final_only";
  const navigation = body.navigation_override === undefined ? current?.navigation_override ?? null : body.navigation_override;
  const enabled = body.owl_help_enabled ?? current?.owl_help_enabled ?? false;
  const limit = body.owl_help_limit === undefined ? current?.owl_help_limit ?? null : body.owl_help_limit;
  if (feedback !== "instant" && feedback !== "final_only") throw new Error("Modo de feedback inválido.");
  if (navigation !== null && navigation !== "open" && navigation !== "closed") throw new Error("Navegação contextual inválida.");
  if (feedback === "instant" && navigation === "open") throw new Error("Feedback imediato exige navegação fechada.");
  if (typeof enabled !== "boolean" || (enabled && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 2147483647))) throw new Error("Informe uma quantidade positiva de ajudas da Coruja.");
  return { feedback_mode: feedback, navigation_override: feedback === "instant" ? "closed" : navigation, owl_help_enabled: enabled, owl_help_limit: enabled ? limit as number : null };
}

export async function resolveContextualSettings(
  supabase: ReturnType<typeof createSupabaseAdminClient>, studentId: string, simuladoId: string,
  context: Exclude<AttemptExecutionContext, { type: "standalone" }>, originalNavigation: unknown,
) {
  let settings: ContextualSimuladoSettings | null;
  if (context.type === "event") {
    const { data, error } = await supabase.from("simulado_event_participants")
      .select("simulado_events:event_id(simulado_id,feedback_mode,navigation_override,owl_help_enabled,owl_help_limit)")
      .eq("id", context.eventParticipantId).eq("event_id", context.eventId).eq("student_id", studentId).maybeSingle();
    const event = data?.simulado_events as unknown as (ContextualSimuladoSettings & { simulado_id: string }) | null;
    if (error || event?.simulado_id !== simuladoId) throw new Error("Configuração do Evento indisponível.");
    settings = event;
  } else {
    const { data, error } = await supabase.from("student_jornada_simulados")
      .select("jornada_simulados:jornada_simulado_id(owl_help_enabled_override,owl_help_limit_override),student_jornadas:student_jornada_id!inner(student_id,jornadas:jornada_id(feedback_mode,navigation_override,owl_help_enabled,owl_help_limit))")
      .eq("id", context.studentJornadaSimuladoId).eq("simulado_id", simuladoId).eq("student_jornadas.student_id", studentId).maybeSingle();
    const row = data as unknown as { jornada_simulados: { owl_help_enabled_override: boolean | null; owl_help_limit_override: number | null }; student_jornadas: { jornadas: ContextualSimuladoSettings } } | null;
    if (error || !row?.student_jornadas?.jornadas || !row.jornada_simulados) throw new Error("Configuração da Jornada indisponível.");
    settings = { ...row.student_jornadas.jornadas };
    if (row.jornada_simulados.owl_help_enabled_override !== null) {
      settings.owl_help_enabled = row.jornada_simulados.owl_help_enabled_override;
      settings.owl_help_limit = row.jornada_simulados.owl_help_limit_override;
    }
  }
  return { feedback_mode: settings.feedback_mode, instant_feedback_enabled: settings.feedback_mode === "instant", navigation_type: settings.feedback_mode === "instant" ? "closed" : settings.navigation_override ?? (originalNavigation === "closed" ? "closed" : "open"), owl_help_enabled: settings.owl_help_enabled, owl_help_limit: settings.owl_help_limit };
}

export async function isAttemptResultReleased(supabase: ReturnType<typeof createSupabaseAdminClient>, attemptId: string, studentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("simulado_attempts")
    .select("status,student_jornada_simulado_id,result_released_at,event_participant_id,simulado_event_participants:event_participant_id(result_released_at)")
    .eq("id", attemptId).eq("student_id", studentId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "completed") return false;
  if (data.event_participant_id) {
    const participant = data.simulado_event_participants as unknown as { result_released_at: string | null } | null;
    return Boolean(participant?.result_released_at);
  }
  return !data.student_jornada_simulado_id || Boolean(data.result_released_at);
}

// Executada depois do commit da conclusão e da troca de result_policy. Em READ
// COMMITTED as duas transações não enxergam uma à outra, e a conclusão pode
// ficar sem result_released_at sob política released. O UPDATE abaixo não
// escolhe o valor: o trigger preserve_jornada_result_release só marca quando a
// política confirmada é released, nunca sob blocked, e não revoga liberações.
export async function reconcileJornadaResultReleases(supabase: ReturnType<typeof createSupabaseAdminClient>, studentJornadaSimuladoIds: string[]) {
  for (let offset = 0; offset < studentJornadaSimuladoIds.length; offset += 200) {
    const { error } = await supabase.from("simulado_attempts")
      .update({ result_released_at: null })
      .in("student_jornada_simulado_id", studentJornadaSimuladoIds.slice(offset, offset + 200))
      .eq("status", "completed")
      .is("result_released_at", null);
    if (error) throw error;
  }
}

export async function releasedAttemptIds(supabase: ReturnType<typeof createSupabaseAdminClient>, studentId: string, ids: string[]): Promise<Set<string>> {
  const released = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase.from("simulado_attempts")
      .select("id,status,student_jornada_simulado_id,result_released_at,event_participant_id,simulado_event_participants:event_participant_id(result_released_at)")
      .eq("student_id", studentId).in("id", ids.slice(offset, offset + 200));
    if (error) throw error;
    for (const row of data || []) {
      const participant = row.simulado_event_participants as unknown as { result_released_at: string | null } | null;
      if (row.status === "completed" && (row.event_participant_id ? Boolean(participant?.result_released_at) : !row.student_jornada_simulado_id || Boolean(row.result_released_at))) released.add(row.id);
    }
  }
  return released;
}
