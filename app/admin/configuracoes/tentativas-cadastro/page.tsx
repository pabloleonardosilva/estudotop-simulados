import { requireAdminPage } from "@/lib/server/authGuard";
import RegistrationAttemptsClient from "./page-client";

export default async function RegistrationAttemptsPage() {
  await requireAdminPage();
  return <RegistrationAttemptsClient />;
}
