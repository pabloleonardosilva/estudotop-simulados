import ResultadoClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function ResultadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attemptId?: string; jornada?: string; event?: string }>;
}) {
  const { id } = await params;
  const { attemptId, jornada, event } = await searchParams;
  return (
    <ResultadoClient
      simuladoId={id}
      attemptId={attemptId || null}
      studentJornadaId={jornada || null}
      eventId={event || null}
    />
  );
}
