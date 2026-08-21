import { requireAdminPage } from "@/lib/server/authGuard";
import EventosAdminClient from "./page-client";

export default async function EventosAdminPage() { await requireAdminPage(); return <EventosAdminClient />; }
