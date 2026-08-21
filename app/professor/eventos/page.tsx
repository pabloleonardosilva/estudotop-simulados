import { requireProfessorPage } from "@/lib/server/authGuard";
import ProfessorEventosClient from "./page-client";

export default async function ProfessorEventosPage() {
  await requireProfessorPage();
  return <ProfessorEventosClient />;
}
