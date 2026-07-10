import NovaRaioXProvaClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import type { BoardOption, DisciplineOption } from "../types";

async function getDisciplines(): Promise<DisciplineOption[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("disciplines").select("id,name").eq("is_active", true).order("name");
  if (error) return [];
  return (data || []) as DisciplineOption[];
}

async function getBoards(): Promise<BoardOption[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("exam_boards").select("id,name").eq("is_active", true).order("name");
  if (error) return [];
  return (data || []) as BoardOption[];
}

function uniqueStrings(arr: (string | null | undefined)[]): string[] {
  return [...new Set(arr.filter((v): v is string => Boolean(v)))];
}

async function getContests(): Promise<{ id: string; name: string }[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("exam_contests").select("id,name").eq("is_active", true).order("name");
  if (error) {
    // Tabela pode não existir ainda — fallback para exam_analyses
    const { data: fallback } = await supabase.from("exam_analyses").select("contest_name");
    return uniqueStrings((fallback || []).map((d) => d.contest_name)).map((name) => ({ id: name, name }));
  }
  return (data || []) as { id: string; name: string }[];
}

async function getPositions(): Promise<{ id: string; name: string }[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("exam_positions").select("id,name").eq("is_active", true).order("name");
  if (error) {
    const { data: fallback } = await supabase.from("exam_analyses").select("position_name");
    return uniqueStrings((fallback || []).map((d) => d.position_name)).map((name) => ({ id: name, name }));
  }
  return (data || []) as { id: string; name: string }[];
}

export default async function NovaRaioXProvaPage() {
  await requireAdminPage();
  const [disciplines, boards, contests, positions] = await Promise.all([getDisciplines(), getBoards(), getContests(), getPositions()]);
  return <NovaRaioXProvaClient disciplines={disciplines} boards={boards} contests={contests} positions={positions} />;
}
