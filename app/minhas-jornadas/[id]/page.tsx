import JornadaAlunoClient from "./page-client";

export const dynamic = "force-dynamic";

export default async function JornadaAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JornadaAlunoClient id={id} />;
}
