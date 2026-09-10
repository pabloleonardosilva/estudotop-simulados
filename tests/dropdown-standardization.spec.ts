import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Padronização global de dropdowns (docs/INDICE_FUNCOES_SISTEMA.md, seção
// 19.4.1/19.4.2, 2026-09-10) — auditoria estrutural: nenhum <select> nativo
// visível deve sobrar fora das exceções documentadas individualmente.

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

// Arquivos com diff pré-existente protegido (outra frente) — o <select>
// nativo ali é uma exceção documentada individualmente, não corrigida nesta
// tarefa para não misturar o diff dessa outra frente.
const PROTECTED_FILES_WITH_NATIVE_SELECT = ["app/questoes/page-client.tsx"];

test.describe("1. Nenhum <select> nativo visível fora das exceções documentadas", () => {
  test("busca global por <select> só encontra as exceções protegidas", () => {
    const output = execSync('git grep -n "<select" -- "app/**/*.tsx"', { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(":")[0]);
    const uniqueFiles = Array.from(new Set(output)).filter(
      (file) => file !== "app/components/ui/PremiumSelect.tsx" && file !== "app/components/ui/PremiumSimpleSelect.tsx",
    );
    expect(uniqueFiles.sort()).toEqual(PROTECTED_FILES_WITH_NATIVE_SELECT.sort());
  });
});

test.describe("2. PremiumSimpleSelect — componente novo cobre o caso 'poucas opções sem busca'", () => {
  test("nunca renderiza <select>, cobre teclado completo, aria e click-outside", () => {
    const source = read("app/components/ui/PremiumSimpleSelect.tsx");
    const codeOnly = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(codeOnly).not.toMatch(/<select[\s>]/);
    expect(codeOnly).toContain('"ArrowDown"');
    expect(codeOnly).toContain('"ArrowUp"');
    expect(codeOnly).toContain('"Enter"');
    expect(codeOnly).toContain('"Escape"');
    expect(codeOnly).toContain('"Tab"');
    expect(codeOnly).toContain("mousedown");
    expect(codeOnly).toContain('aria-haspopup="listbox"');
    expect(codeOnly).toContain("aria-expanded={open}");
    expect(codeOnly).toContain('role="listbox"');
    expect(codeOnly).toContain('role="option"');
  });

  test("suporta dark/light, compact e disabled sem quebrar consumidores existentes", () => {
    const source = read("app/components/ui/PremiumSimpleSelect.tsx");
    expect(source).toContain("dark?: boolean");
    expect(source).toContain("compact?: boolean");
    expect(source).toContain("disabled?: boolean");
    expect(source).toContain("disabled = false");
  });
});

test.describe("3. SearchableSelect — ganhou suporte a disabled nesta Sprint", () => {
  test("prop disabled existe e bloqueia abertura do menu nos dois temas", () => {
    const source = read("app/components/ui/SearchableSelect.tsx");
    expect(source).toContain("disabled?: boolean");
    expect(source).toContain("if (disabled) return;");
    expect(source).toMatch(/disabled=\{disabled\}[\s\S]*?disabled:cursor-not-allowed/);
  });
});

test.describe("4. PremiumSelect antigo — consumidores restantes são só os arquivos protegidos", () => {
  test("apenas os 3 arquivos com diff pré-existente ainda importam PremiumSelect", () => {
    const output = execSync('git grep -l "<PremiumSelect\\b" -- "app/**/*.tsx"', { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(output.sort()).toEqual([
      "app/questoes/nova/page-client.tsx",
      "app/questoes/page-client.tsx",
      "app/questoes/revisar/page-client.tsx",
    ].sort());
  });
});

test.describe("5. Migração preserva funcionalidade (amostras representativas)", () => {
  test("Central de Tentativas: filtros continuam com os mesmos values/labels de Situação/Etapa/Período", () => {
    const source = read("app/admin/configuracoes/tentativas-cadastro/page-client.tsx");
    expect(source).toContain('["all", "Todos"]');
    expect(source).toContain('["open", "Em aberto"]');
    expect(source).toContain('["contacted", "Contatados"]');
    expect(source).toContain('["ignored", "Ignorados"]');
  });

  test("admin/logs: Ator preserva Todos/Admin/Aluno/Sistema; severidade preserva ordem semântica via severityOptions", () => {
    const source = read("app/admin/logs/page-client.tsx");
    expect(source).toContain('["all", "Todos"]');
    expect(source).toContain("severityOptions(activeTab)");
  });

  test("admin/alunos/novo: campo Origem migrado mantém participação no FormData via input hidden", () => {
    const source = read("app/admin/alunos/novo/page.tsx");
    expect(source).toContain('<input type="hidden" name="origin" value={origin} />');
    expect(source).toContain('setOrigin("Manual")');
  });

  test("simulados: 'Simulado base' preserva disabled quando lista vazia e ordenação por título", () => {
    const source = read("app/simulados/page-client.tsx");
    expect(source).toContain("disabled={duplicatingSimulado || simulados.length === 0}");
    expect(source).toContain("sortByPtBrLabel(simulados, (item) => item.title)");
  });
});
