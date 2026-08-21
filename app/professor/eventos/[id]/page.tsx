import { requireProfessorPage } from "@/lib/server/authGuard";
import ProfessorEventoClient from "./page-client";

export default async function ProfessorEventoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfessorPage();
  const { id } = await params;
  return <ProfessorEventoClient id={id} />;
}
