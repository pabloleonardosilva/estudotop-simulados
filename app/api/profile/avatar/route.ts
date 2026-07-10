import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Envie uma imagem para atualizar a foto." }, { status: 400 });
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, message: "Use uma imagem JPG, PNG ou WebP." }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return NextResponse.json({ ok: false, message: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
  }

  const extension = extensionFor(file.type);
  const path = `${userData.user.id}/avatar-${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("profile-avatars")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ ok: false, message: "Não foi possível enviar a foto." }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  const avatarUrl = publicUrlData.publicUrl;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userData.user.id);

  if (profileError) {
    return NextResponse.json({ ok: false, message: "Foto enviada, mas não foi possível atualizar o perfil." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Foto atualizada com sucesso.", avatar_url: avatarUrl }, { status: 200 });
}
