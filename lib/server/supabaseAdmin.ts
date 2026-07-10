import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo do Supabase.
 *
 * IMPORTANTE:
 * - Este arquivo só deve ser usado no servidor: API routes e Server Components.
 * - Nunca importe este cliente em componentes com "use client".
 * - Ele usa a SUPABASE_SERVICE_ROLE_KEY, que jamais deve ir para o navegador.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada no .env.local.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no .env.local.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
