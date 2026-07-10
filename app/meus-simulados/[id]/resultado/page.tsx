import ResultadoClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultadoClient simuladoId={id} />;
}
