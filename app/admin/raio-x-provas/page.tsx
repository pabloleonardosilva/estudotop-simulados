import RaioXProvasClient from "./page-client";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import type { RaioXAnalysis } from "./types";

async function getAnalyses(): Promise<RaioXAnalysis[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("exam_analyses")
    .select("id,title,contest_name,position_name,exam_year,board_name,discipline_id,discipline_name,status,summary_text,dashboard,modules_summary,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (/exam_analyses/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  return (data || []) as RaioXAnalysis[];
}

export type FilterOptions = {
  contests: string[];
  positions: string[];
  boards: string[];
  years: string[];
};

function uniqueStrings(arr: (string | null | undefined)[]): string[] {
  return [...new Set(arr.filter((v): v is string => Boolean(v)))];
}

function buildFilterOptions(analyses: RaioXAnalysis[]): FilterOptions {
  return {
    contests: uniqueStrings(analyses.map((a) => a.contest_name)).sort(),
    positions: uniqueStrings(analyses.map((a) => a.position_name)).sort(),
    boards: uniqueStrings(analyses.map((a) => a.board_name)).sort(),
    years: uniqueStrings(analyses.map((a) => String(a.exam_year))).sort().reverse(),
  };
}

export default async function RaioXProvasPage() {
  await requireAdminPage();
  const analyses = await getAnalyses();
  return <RaioXProvasClient analyses={analyses} filterOptions={buildFilterOptions(analyses)} />;
}
