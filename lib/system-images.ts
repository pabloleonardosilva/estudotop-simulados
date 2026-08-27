export const SYSTEM_IMAGE_TYPES = ["journey_card", "event_card", "professor_event_banner"] as const;
export type SystemImageType = (typeof SYSTEM_IMAGE_TYPES)[number];

export type SystemImage = {
  id: string;
  image_type: SystemImageType;
  name: string;
  storage_path: string;
  url: string;
  created_at: string;
};

export function systemImageUrl(storagePath: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base || !storagePath) return null;
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/system-images/${path}`;
}
