import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Confirma a senha do Admin atualmente autenticado, sem afetar a sessão do
 * navegador. Usa um client Supabase efêmero e isolado (chave anônima,
 * `persistSession`/`autoRefreshToken` desligados) — nunca reaproveita o client
 * de service role nem o client de sessão do browser (`@/lib/supabase/server`).
 * A sessão gerada pela validação é descartada imediatamente após o uso, com
 * `signOut({ scope: "local" })` — o escopo padrão do Supabase Auth é
 * `"global"`, que revoga TODAS as sessões da conta no servidor (inclusive a
 * sessão real do navegador do Admin, mesmo sendo o mesmo e-mail em um client
 * totalmente separado); `"local"` apenas descarta o estado deste client
 * efêmero, sem revogar nada no GoTrue.
 *
 * O rate limiting de tentativas de senha é o nativo do Supabase Auth
 * (GoTrue) sobre `signInWithPassword` — não há necessidade de um mecanismo
 * adicional aqui.
 */
export async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Configuração do Supabase ausente.");

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;

  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}
