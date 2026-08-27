import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const legacy = [
  { key: "saude", name: "Área da Saúde", file: "saude.webp" },
  { key: "policial", name: "Policial", file: "policial.webp" },
  { key: "tribunais", name: "Tribunais", file: "tribunais.webp" },
  { key: "administrativo", name: "Administrativo", file: "administrativo.webp" },
];

async function ensureImage(imageType, folder, item) {
  const storagePath = `${folder}/legacy-${item.key}${extname(item.file)}`;
  const bytes = await readFile(join(process.cwd(), "public", "jornadas", "categories", item.file));
  const { error: uploadError } = await supabase.storage.from("system-images").upload(storagePath, bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
  const { data: existing, error: findError } = await supabase.from("system_images").select("id").eq("image_type", imageType).eq("storage_path", storagePath).maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;
  const { data, error } = await supabase.from("system_images").insert({ image_type: imageType, name: item.name, storage_path: storagePath, mime_type: "image/webp" }).select("id").single();
  if (error) throw error;
  return data.id;
}

for (const item of legacy) {
  const journeyImageId = await ensureImage("journey_card", "journey-cards", item);
  const eventImageId = await ensureImage("event_card", "event-cards", item);
  const { error: journeyError } = await supabase.from("jornadas").update({ card_image_id: journeyImageId }).eq("category", item.key).is("card_image_id", null);
  if (journeyError) throw journeyError;
  const { error: eventError } = await supabase.from("simulado_events").update({ card_image_id: eventImageId }).eq("cover_key", item.key).is("card_image_id", null);
  if (eventError) throw eventError;

  if (item.key === "administrativo") {
    const { error: defaultEventError } = await supabase.from("simulado_events").update({ card_image_id: eventImageId }).is("cover_key", null).is("card_image_id", null);
    if (defaultEventError) throw defaultEventError;
  }
}

console.log("Bootstrap idempotente da biblioteca de imagens concluído.");
