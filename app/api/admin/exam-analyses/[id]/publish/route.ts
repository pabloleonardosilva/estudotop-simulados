import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("exam_analyses")
    .select("public_token")
    .eq("id", id)
    .single();

  if (existing?.public_token) {
    return NextResponse.json({ ok: true, token: existing.public_token });
  }

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from("exam_analyses")
    .update({ public_token: token })
    .eq("id", id);

  if (error) {
    void logSystemError({ source: "api.admin.exam_analyses.publish", error, request, metadata: { analysis_id: id } });
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  void logAdminAction({ adminUserId: admin.id, action: "admin.raiox.published", entityType: "exam_analysis", entityId: id, request });
  return NextResponse.json({ ok: true, token });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("exam_analyses")
    .update({ public_token: null })
    .eq("id", id);

  if (error) {
    void logSystemError({ source: "api.admin.exam_analyses.unpublish", error, request, metadata: { analysis_id: id } });
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  void logAdminAction({ adminUserId: admin.id, action: "admin.raiox.unpublished", entityType: "exam_analysis", entityId: id, request });
  return NextResponse.json({ ok: true });
}
