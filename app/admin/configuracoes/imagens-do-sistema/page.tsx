import { requireAdminPage } from "@/lib/server/authGuard";
import SystemImagesClient from "./page-client";

export default async function SystemImagesPage() {
  await requireAdminPage();
  return <SystemImagesClient />;
}
