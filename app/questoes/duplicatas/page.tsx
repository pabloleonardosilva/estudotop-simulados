import DuplicatasClient from "./page-client";
import { requireAdminPage } from "@/lib/server/authGuard";

export default async function DuplicatasPage() {
  await requireAdminPage();
  return <DuplicatasClient />;
}
