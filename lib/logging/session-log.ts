import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requestIp, requestRoute, requestUserAgent, sanitizeLogMetadata } from "./sanitize";

type ActorType = "admin" | "student";

export type SessionLogInput = {
  request?: Request | null;
  actorType: ActorType;
  actorId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  lastRoute?: string | null;
  metadata?: Record<string, unknown>;
};

export async function touchUserSession(input: SessionLogInput) {
  try {
    const request = input.request || null;
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const lastRoute = input.lastRoute ?? requestRoute(request);

    const { data: current } = await supabase
      .from("user_sessions")
      .select("id, started_at")
      .eq("actor_type", input.actorType)
      .eq("actor_id", input.actorId)
      .eq("is_active", true)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (current?.id) {
      const duration = current.started_at
        ? Math.max(0, Math.floor((Date.now() - new Date(current.started_at).getTime()) / 1000))
        : null;

      await supabase
        .from("user_sessions")
        .update({
          last_seen_at: now,
          duration_seconds: duration,
          last_route: lastRoute,
          metadata: sanitizeLogMetadata(input.metadata || {}),
        })
        .eq("id", current.id);
      return;
    }

    await supabase.from("user_sessions").insert({
      actor_type: input.actorType,
      actor_id: input.actorId,
      actor_name: input.actorName || null,
      actor_email: input.actorEmail || null,
      started_at: now,
      last_seen_at: now,
      ip_address: requestIp(request),
      user_agent: requestUserAgent(request),
      last_route: lastRoute,
      is_active: true,
      metadata: sanitizeLogMetadata(input.metadata || {}),
    });
  } catch (error) {
    console.warn("[audit-log] session log skipped", error);
  }
}
