// Utilitário central para registrar eventos no histórico do aluno.
// Mantém compatibilidade com bancos que ainda possuem CHECK antigo em event_type.
// Se o evento novo não for aceito, registra como field_update com descrição clara.

type SupabaseLike = {
  from: (table: string) => {
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => PromiseLike<{ error: unknown | null }>;
  };
};

type LogPasswordActivityParams = {
  supabase: SupabaseLike;
  studentId: string;
  eventType: "password_reset" | "password_changed";
  description: string;
  performedByName: string;
  details?: Record<string, unknown>;
};

export async function logPasswordActivity({
  supabase,
  studentId,
  eventType,
  description,
  performedByName,
  details = {},
}: LogPasswordActivityParams) {
  const primaryPayload = {
    student_id: studentId,
    event_type: eventType,
    description,
    details,
    performed_by_name: performedByName,
  };

  const { error: primaryError } = await supabase
    .from("student_activity_log")
    .insert(primaryPayload);

  if (!primaryError) return { ok: true, fallback: false };

  // Fallback: alguns bancos locais podem estar com CHECK antigo no campo event_type.
  // field_update já existe desde a implementação original do histórico, então o evento aparece na timeline.
  const fallbackPayload = {
    student_id: studentId,
    event_type: "field_update",
    description,
    details: {
      field: "senha",
      from: null,
      to: "alterada",
      security_event_type: eventType,
      ...details,
    },
    performed_by_name: performedByName,
  };

  const { error: fallbackError } = await supabase
    .from("student_activity_log")
    .insert(fallbackPayload);

  return { ok: !fallbackError, fallback: true, error: fallbackError || primaryError };
}
