import { requireEventManagerPage } from "@/lib/server/authGuard";
import ProfessorEventoClient from "./page-client";

export default async function ProfessorEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEventManagerPage(id);
  return <ProfessorEventoClient id={id} />;
}
