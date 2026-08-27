import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { SYSTEM_IMAGE_TYPES, systemImageUrl, type SystemImageType } from "@/lib/system-images";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FOLDERS: Record<SystemImageType, string> = {
  journey_card: "journey-cards",
  event_card: "event-cards",
  professor_event_banner: "professor-event-banners",
};

function isImageType(value: string): value is SystemImageType {
  return (SYSTEM_IMAGE_TYPES as readonly string[]).includes(value);
}

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function hasValidSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const type = new URL(request.url).searchParams.get("type") || "";
  if (!isImageType(type)) return NextResponse.json({ ok: false, message: "Biblioteca de imagens inválida." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("system_images").select("id,image_type,name,storage_path,created_at").eq("image_type", type).order("name");
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar as imagens." }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Imagens carregadas.", images: (data || []).map((image) => ({ ...image, url: systemImageUrl(image.storage_path) })) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  let uploadedPath: string | null = null;
  const supabase = createSupabaseAdminClient();
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const type = String(formData.get("type") || "");
    const name = String(formData.get("name") || "").trim();
    if (!isImageType(type)) return NextResponse.json({ ok: false, message: "Biblioteca de imagens inválida." }, { status: 400 });
    if (!name || name.length > 120) return NextResponse.json({ ok: false, message: "Informe um nome de até 120 caracteres." }, { status: 400 });
    if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type)) return NextResponse.json({ ok: false, message: "Use uma imagem JPEG, PNG ou WebP." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) return NextResponse.json({ ok: false, message: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidSignature(file.type, buffer)) return NextResponse.json({ ok: false, message: "O conteúdo do arquivo não corresponde a uma imagem válida." }, { status: 400 });
    uploadedPath = `${FOLDERS[type]}/${randomUUID()}.${extensionFor(file.type)}`;
    const { error: uploadError } = await supabase.storage.from("system-images").upload(uploadedPath, buffer, { cacheControl: "31536000", contentType: file.type, upsert: false });
    if (uploadError) return NextResponse.json({ ok: false, message: "Não foi possível enviar a imagem." }, { status: 500 });
    const { data, error } = await supabase.from("system_images").insert({ image_type: type, name, storage_path: uploadedPath, mime_type: file.type, created_by: admin.id }).select("id,image_type,name,storage_path,created_at").single();
    if (error || !data) {
      await supabase.storage.from("system-images").remove([uploadedPath]);
      return NextResponse.json({ ok: false, message: "Não foi possível registrar a imagem." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Imagem adicionada com sucesso.", image: { ...data, url: systemImageUrl(data.storage_path) } }, { status: 201 });
  } catch {
    if (uploadedPath) await supabase.storage.from("system-images").remove([uploadedPath]);
    return NextResponse.json({ ok: false, message: "Erro inesperado ao enviar a imagem." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const imageId = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageId)) return NextResponse.json({ ok: false, message: "Informe uma imagem válida para exclusão." }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: image, error: imageError } = await supabase.from("system_images").select("id,image_type,storage_path,mime_type").eq("id", imageId).maybeSingle();
  if (imageError) return NextResponse.json({ ok: false, message: "Não foi possível verificar a imagem." }, { status: 500 });
  if (!image) return NextResponse.json({ ok: false, message: "Imagem não encontrada." }, { status: 404 });
  if (!isImageType(image.image_type)) return NextResponse.json({ ok: false, message: "Tipo de imagem inválido." }, { status: 500 });

  const checkUsage = () => image.image_type === "journey_card"
    ? supabase.from("jornadas").select("id", { count: "exact", head: true }).eq("card_image_id", image.id)
    : image.image_type === "event_card"
      ? supabase.from("simulado_events").select("id", { count: "exact", head: true }).eq("card_image_id", image.id)
      : supabase.from("simulado_events").select("id", { count: "exact", head: true }).eq("professor_banner_image_id", image.id);
  const usageMessage = image.image_type === "journey_card"
    ? "Esta imagem está sendo utilizada por uma ou mais Jornadas. Troque a imagem dessas Jornadas antes de excluí-la."
    : image.image_type === "event_card"
      ? "Esta imagem está sendo utilizada por um ou mais Eventos. Troque a imagem desses Eventos antes de excluí-la."
      : "Esta imagem está sendo utilizada como banner da área do professor em um ou mais Eventos. Troque o banner desses Eventos antes de excluí-la.";
  const { count: usageCount, error: usageError } = await checkUsage();
  if (usageError) return NextResponse.json({ ok: false, message: "Não foi possível verificar se a imagem está em uso." }, { status: 500 });
  if ((usageCount || 0) > 0) return NextResponse.json({ ok: false, message: usageMessage }, { status: 409 });

  const { data: backup, error: backupError } = await supabase.storage.from("system-images").download(image.storage_path);
  if (backupError || !backup) return NextResponse.json({ ok: false, message: "Não foi possível preparar a exclusão segura do arquivo." }, { status: 500 });
  const backupBytes = Buffer.from(await backup.arrayBuffer());
  const { count: finalUsageCount, error: finalUsageError } = await checkUsage();
  if (finalUsageError) return NextResponse.json({ ok: false, message: "Não foi possível confirmar se a imagem continua livre para exclusão." }, { status: 500 });
  if ((finalUsageCount || 0) > 0) return NextResponse.json({ ok: false, message: usageMessage }, { status: 409 });
  const { error: storageError } = await supabase.storage.from("system-images").remove([image.storage_path]);
  if (storageError) return NextResponse.json({ ok: false, message: "Não foi possível remover o arquivo da imagem." }, { status: 500 });

  const { error: deleteError } = await supabase.from("system_images").delete().eq("id", image.id);
  if (deleteError) {
    const { error: restoreError } = await supabase.storage.from("system-images").upload(image.storage_path, backupBytes, { contentType: image.mime_type, cacheControl: "31536000", upsert: true });
    const message = restoreError
      ? "A exclusão não foi concluída e o arquivo não pôde ser restaurado automaticamente. Contate o suporte antes de reutilizar esta imagem."
      : deleteError.code === "23503"
        ? "A imagem passou a ser utilizada e não pode mais ser excluída. O arquivo foi restaurado."
        : "Não foi possível excluir o registro da imagem. O arquivo foi restaurado.";
    return NextResponse.json({ ok: false, message }, { status: deleteError.code === "23503" && !restoreError ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, message: "Imagem excluída com sucesso.", id: image.id });
}
