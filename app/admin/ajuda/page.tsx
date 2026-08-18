import { requireAdminPage } from "@/lib/server/authGuard";
import AjudaAdminClient from "./page-client";

export default async function AjudaAdminPage() {
  await requireAdminPage();
  return <AjudaAdminClient />;
}
