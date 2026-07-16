import JornadaAlunoClient, { type JornadaTab } from "./page-client";

export const dynamic = "force-dynamic";

const VALID_TABS: JornadaTab[] = ["dados", "simulados", "resultados", "info"];

export default async function JornadaAlunoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const initialTab = VALID_TABS.includes(tab as JornadaTab) ? (tab as JornadaTab) : "dados";
  return <JornadaAlunoClient id={id} initialTab={initialTab} />;
}
