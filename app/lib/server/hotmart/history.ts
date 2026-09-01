import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeLogMetadata } from "@/app/lib/server/auditLogger";

export async function recordHotmartHistory(supabase: SupabaseClient, input: {
  action: string;
  actorType?: "system" | "admin" | "hotmart";
  actorId?: string | null;
  studentId?: string | null;
  transactionId?: string | null;
  mappingId?: string | null;
  accessLinkId?: string | null;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("hotmart_history").insert({
    action: input.action,
    actor_type: input.actorType || "system",
    actor_id: input.actorId || null,
    student_id: input.studentId || null,
    transaction_id: input.transactionId || null,
    mapping_id: input.mappingId || null,
    access_link_id: input.accessLinkId || null,
    previous_data: input.previousData ? sanitizeLogMetadata(input.previousData) : null,
    new_data: input.newData ? sanitizeLogMetadata(input.newData) : null,
    metadata: sanitizeLogMetadata(input.metadata),
  });
}
