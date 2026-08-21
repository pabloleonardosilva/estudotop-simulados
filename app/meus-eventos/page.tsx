import { requireStudentPage } from "@/lib/server/authGuard";
import MeusEventosClient from "./page-client";

export default async function MeusEventosPage() {
  await requireStudentPage();
  return <MeusEventosClient />;
}
