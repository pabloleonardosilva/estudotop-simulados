import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_AVATAR_IDS = new Set(Array.from({ length: 128 }, (_, index) => `avatar-${String(index + 1).padStart(3, "0")}`));

function isMissingAvatarColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || error.message?.includes("avatar_url") || error.message?.includes("schema cache");
}

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

export async function PATCH(request: Request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const avatarId = typeof body?.avatar_id === "string" ? body.avatar_id : "";
  if (!ALLOWED_AVATAR_IDS.has(avatarId)) {
    return NextResponse.json({ ok: false, message: "Avatar inválido." }, { status: 400 });
  }

  const avatarUrl = `/images/profile-avatars/${avatarId}.webp`;
  const { data: currentStudent, error: loadStudentError } = await supabase.from("students").select("avatar_url").eq("id", userData.user.id).single();
  if (loadStudentError || !currentStudent) {
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar seu avatar." }, { status: 500 });
  }

  const { error: studentError } = await supabase.from("students").update({ avatar_url: avatarUrl }).eq("id", userData.user.id);
  if (studentError) return NextResponse.json({ ok: false, message: "Não foi possível atualizar seu avatar." }, { status: 500 });

  const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userData.user.id);
  if (profileError && !isMissingAvatarColumnError(profileError)) {
    await supabase.from("students").update({ avatar_url: currentStudent.avatar_url }).eq("id", userData.user.id);
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar seu avatar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Avatar atualizado com sucesso.", avatar_url: avatarUrl }, { status: 200 });
}

export async function DELETE(request: Request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 401 });

  const { data: student, error: loadError } = await supabase.from("students").select("avatar_url").eq("id", userData.user.id).single();
  if (loadError || !student) return NextResponse.json({ ok: false, message: "Não foi possível carregar sua foto." }, { status: 500 });

  const { error: studentUpdateError } = await supabase.from("students").update({ avatar_url: null }).eq("id", userData.user.id);
  if (studentUpdateError) return NextResponse.json({ ok: false, message: "Não foi possível remover sua foto." }, { status: 500 });

  const { error: profileUpdateError } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userData.user.id);
  if (profileUpdateError && !isMissingAvatarColumnError(profileUpdateError)) {
    await supabase.from("students").update({ avatar_url: student.avatar_url }).eq("id", userData.user.id);
    return NextResponse.json({ ok: false, message: "Não foi possível remover sua foto." }, { status: 500 });
  }

  const marker = "/profile-avatars/";
  const path = student.avatar_url?.includes(marker) ? decodeURIComponent(student.avatar_url.split(marker)[1]) : null;
  if (path?.startsWith(`${userData.user.id}/`)) await supabase.storage.from("profile-avatars").remove([path]);

  return NextResponse.json({ ok: true, message: "Foto removida com sucesso.", avatar_url: null }, { status: 200 });
}
