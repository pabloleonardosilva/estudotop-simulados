import { requireStudentPage } from "@/lib/server/authGuard";
import EventoAlunoClient from "./page-client";

export default async function EventoAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudentPage();
  const { id } = await params;
  return <EventoAlunoClient id={id} />;
}
