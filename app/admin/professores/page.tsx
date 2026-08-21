import { requireAdminPage } from "@/lib/server/authGuard";
import ProfessoresAdminClient from "./page-client";

export default async function ProfessoresAdminPage() { await requireAdminPage(); return <ProfessoresAdminClient />; }
