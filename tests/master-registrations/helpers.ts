import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { APIRequestContext } from "@playwright/test";

export type AttemptResult = {
  input: string;
  normalized: string;
  status: number;
  ok: boolean;
  created?: boolean;
  message?: string;
  rowsAfter: string[];
};

export type Finding = {
  area: "Disciplinas" | "Assuntos" | "Bancas" | "Normalizacao";
  severity: "pass" | "fail" | "info";
  scenario: string;
  detail: string;
};

const envLoaded = new Set<string>();

export function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath) || envLoaded.has(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }

  envLoaded.add(envPath);
}

export function supabaseAdmin(): SupabaseClient {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function normalizeEntityLikeApp(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function normalizeBoardLikeApp(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function logicalKey(value: string, options?: { slashSpaces?: boolean; punctuation?: boolean }) {
  let normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (options?.slashSpaces) {
    normalized = normalized.replace(/\s*\/\s*/g, "/");
  }

  if (options?.punctuation) {
    normalized = normalized.replace(/[^\p{L}\p{N}/ ]/gu, "");
  }

  return normalized;
}

export async function cleanupMasterTestData(client: SupabaseClient, prefix: string) {
  const { data: disciplines } = await client
    .from("disciplines")
    .select("id")
    .ilike("name", `${prefix}%`);

  const disciplineIds = (disciplines || []).map((item) => item.id);

  if (disciplineIds.length > 0) {
    await client.from("subjects").delete().in("discipline_id", disciplineIds);
  }

  await client.from("subjects").delete().ilike("name", `${prefix}%`);
  await client.from("disciplines").delete().ilike("name", `${prefix}%`);
  await client.from("exam_boards").delete().ilike("name", `${prefix}%`);
}

export async function listNames(client: SupabaseClient, table: string, prefix: string, disciplineId?: string) {
  let query = client.from(table).select("name").ilike("name", `${prefix}%`).order("name");

  if (disciplineId) {
    query = query.eq("discipline_id", disciplineId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((item: { name: string }) => item.name);
}

export async function postJson(request: APIRequestContext, url: string, body: unknown) {
  const response = await request.post(url, { data: body });
  let json: Record<string, unknown> = {};

  try {
    json = await response.json();
  } catch {
    json = {};
  }

  return {
    status: response.status(),
    ok: Boolean(json.ok),
    created: typeof json.created === "boolean" ? json.created : undefined,
    message: String(json.message || ""),
    json,
  };
}

export function assertNoUnexpectedLogicalDuplicates(
  area: Finding["area"],
  scenario: string,
  names: string[],
  expectedEquivalentInputs: string[],
  findings: Finding[],
  options?: { slashSpaces?: boolean; punctuation?: boolean },
) {
  const expectedKeys = new Set(expectedEquivalentInputs.map((name) => logicalKey(name, options)));
  const matching = names.filter((name) => expectedKeys.has(logicalKey(name, options)));

  if (matching.length <= 1) {
    findings.push({
      area,
      severity: "pass",
      scenario,
      detail: `Encontrado ${matching.length} registro para o grupo lógico esperado.`,
    });
    return;
  }

  findings.push({
    area,
    severity: "fail",
    scenario,
    detail: `Foram criados ${matching.length} registros logicamente equivalentes: ${matching.join(" | ")}`,
  });
}

export function recordValidationResult(
  findings: Finding[],
  area: Finding["area"],
  scenario: string,
  result: AttemptResult,
  shouldCreate: boolean,
) {
  const blocked = !result.ok || result.status >= 400 || result.created === false;

  if (shouldCreate && result.ok) {
    findings.push({
      area,
      severity: "pass",
      scenario,
      detail: `Criou/salvou como esperado. Status ${result.status}. Mensagem: ${result.message || "(sem mensagem)"}`,
    });
    return;
  }

  if (!shouldCreate && blocked) {
    findings.push({
      area,
      severity: "pass",
      scenario,
      detail: `Bloqueou/ignorou como esperado. Status ${result.status}. Mensagem: ${result.message || "(sem mensagem)"}`,
    });
    return;
  }

  findings.push({
    area,
    severity: "fail",
    scenario,
    detail: `Comportamento inesperado para "${result.input}". Status ${result.status}, ok=${result.ok}, created=${String(result.created)}, mensagem="${result.message}".`,
  });
}

export async function writeAuditReport(findings: Finding[], reportName = "audit-report") {
  const outputDir = path.join(process.cwd(), "test-results", "master-registrations");
  const outputPath = path.join(outputDir, `${reportName}.json`);
  await fs.promises.mkdir(outputDir, { recursive: true });

  await fs.promises.writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        findings,
      },
      null,
      2,
    ),
  );
}
