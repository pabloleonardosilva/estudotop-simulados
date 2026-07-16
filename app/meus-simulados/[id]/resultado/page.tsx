import ResultadoClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function ResultadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attemptId?: string; jornada?: string }>;
}) {
  const { id } = await params;
  const { attemptId, jornada } = await searchParams;
  return (
    <ResultadoClient
      simuladoId={id}
      attemptId={attemptId || null}
      studentJornadaId={jornada || null}
    />
  );
}
