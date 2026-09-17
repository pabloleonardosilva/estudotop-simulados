/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { readTestAdminConfig } = require("../tests/helpers/test-admin-auth.cjs");
const { assertSafeSupabaseTestEnvironment } = require("../tests/helpers/supabase-test-environment.cjs");

async function setupTestAdmin() {
  const config = readTestAdminConfig();
  assertSafeSupabaseTestEnvironment();
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let stage = "lookup";
  try {
    let user;
    for (let page = 1; ; page += 1) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      user = data.users.find((candidate) => candidate.email?.toLowerCase() === config.email);
      if (user || data.users.length < 100) break;
    }
    const created = !user;
    if (!user) {
      stage = "create";
      const { data, error } = await client.auth.admin.createUser({
        email: config.email, password: config.password, email_confirm: true,
      });
      if (error || !data.user) throw new Error("create failed");
      user = data.user;
    }
    if (!user.email_confirmed_at) {
      stage = "confirm";
      const { error } = await client.auth.admin.updateUserById(user.id, { email_confirm: true });
      if (error) throw error;
    }
    stage = "profile";
    const { data: profile, error: readError } = await client.from("profiles")
      .select("id, role, is_active").eq("id", user.id).maybeSingle();
    if (readError) throw readError;
    let profileAction = "unchanged";
    if (!profile) {
      const { error } = await client.from("profiles").insert({ id: user.id, full_name: "Synthetic Test Admin", role: "admin", is_active: true });
      if (error) throw error;
      profileAction = "created";
    } else if (profile.role !== "admin" || profile.is_active !== true) {
      const { error } = await client.from("profiles").update({ role: "admin", is_active: true }).eq("id", user.id);
      if (error) throw error;
      profileAction = "updated";
    }
    const { data: verified, error: verifyError } = await client.from("profiles")
      .select("id, role, is_active").eq("id", user.id).single();
    if (verifyError || verified?.id !== user.id || verified.role !== "admin" || verified.is_active !== true) throw new Error("profile verification failed");
    return { authUser: created ? "created" : "reused", emailConfirmed: true, profile: profileAction, profileAdminActive: true, persistent: true };
  } catch {
    throw new Error("Synthetic test admin setup failed at " + stage + ". No credentials are logged; rerun after correcting the test environment.");
  }
}

if (require.main === module) {
  setupTestAdmin().then((summary) => console.log(JSON.stringify(summary))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { setupTestAdmin };
