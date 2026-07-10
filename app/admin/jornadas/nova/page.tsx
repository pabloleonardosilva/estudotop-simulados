import NovaJornadaClient from "./page-client";
import { requireAdminPage } from "@/lib/server/authGuard";

export default async function NovaJornadaPage() {
  await requireAdminPage();
  return <NovaJornadaClient />;
}
