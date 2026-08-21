import { requireAdminPage } from "@/lib/server/authGuard";
import EventoAdminDetailClient from "./page-client";

export default async function EventoAdminDetailPage({ params }: { params: Promise<{ id: string }> }) { await requireAdminPage(); const { id } = await params; return <EventoAdminDetailClient id={id} />; }
