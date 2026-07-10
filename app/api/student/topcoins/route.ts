import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type EarningRow = {
  id: string;
  simulado_id: string;
  jornada_id: string | null;
  attempt_number: number;
  amount: number;
  created_at: string;
  simulados: { title: string | null } | { title: string | null }[] | null;
  jornadas: { title: string | null } | { title: string | null }[] | null;
};

function relationRef<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("topcoin_earnings")
    .select(
      `
        id,
        simulado_id,
        jornada_id,
        attempt_number,
        amount,
        created_at,
        simulados:simulado_id ( title ),
        jornadas:jornada_id ( title )
      `,
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  if (error) {
    void logSystemError({ source: "api.student.topcoins", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seus TopCoins." }, { status: 500 });
  }

  const rows = (data || []) as unknown as EarningRow[];

  const entries = rows.map((row) => ({
    id: row.id,
    simulado_id: row.simulado_id,
    simulado_title: relationRef(row.simulados)?.title || "Simulado",
    jornada_id: row.jornada_id,
    jornada_title: relationRef(row.jornadas)?.title || null,
    attempt_number: row.attempt_number,
    amount: row.amount,
    created_at: row.created_at,
  }));

  const balance = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return NextResponse.json({ ok: true, balance, entries });
}
