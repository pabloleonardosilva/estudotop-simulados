import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function hasValidSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (type === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }

  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Envie uma imagem válida." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, message: "Use uma imagem JPG, PNG ou WebP." }, { status: 400 });
    }

    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ ok: false, message: "A imagem deve ter entre 1 byte e 5 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidSignature(file.type, buffer)) {
      return NextResponse.json({ ok: false, message: "O conteúdo do arquivo não corresponde a uma imagem válida." }, { status: 400 });
    }

    const extension = extensionFor(file.type);
    const year = new Date().getUTCFullYear();
    const path = `${admin.id}/${year}/${randomUUID()}.${extension}`;
    const supabase = createSupabaseAdminClient();
    const { error: uploadError } = await supabase.storage
      .from("question-images")
      .upload(path, buffer, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ ok: false, message: "Não foi possível enviar a imagem." }, { status: 500 });
    }

    const { data } = supabase.storage.from("question-images").getPublicUrl(path);
    return NextResponse.json({ ok: true, message: "Imagem enviada com sucesso.", url: data.publicUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, message: "Erro inesperado ao enviar a imagem." }, { status: 500 });
  }
}
