import { expect, test } from "@playwright/test";
import { normalizeEntityName } from "../../lib/utils/text";
import { logicalKey, type Finding, writeAuditReport } from "./helpers";

const findings: Finding[] = [];

test.afterAll(async () => {
  await writeAuditReport(findings, "audit-report-normalization");
});

test("normalizacao pura de disciplinas e assuntos", () => {
  const cases = [
    { input: "", expected: "" },
    { input: "   ", expected: "" },
    { input: " Raciocínio  Lógico ", expected: "Raciocínio Lógico" },
    { input: "raciocínio lógico", expected: "Raciocínio Lógico" },
    { input: "TABELA  VERDADE LÓGICA", expected: "Tabela Verdade Lógica" },
  ];

  for (const item of cases) {
    const actual = normalizeEntityName(item.input);
    if (actual === item.expected) {
      findings.push({
        area: "Normalizacao",
        severity: "pass",
        scenario: `normalizeEntityName("${item.input}")`,
        detail: `Resultado: "${actual}"`,
      });
    } else {
      findings.push({
        area: "Normalizacao",
        severity: "fail",
        scenario: `normalizeEntityName("${item.input}")`,
        detail: `Esperado "${item.expected}", recebido "${actual}".`,
      });
    }

    expect.soft(actual).toBe(item.expected);
  }
});

test("chave logica ideal remove caixa, acentos e espacos excedentes", () => {
  const group = [
    "Raciocínio Lógico",
    "Raciocinio Logico",
    "RACIOCÍNIO LÓGICO",
    "raciocínio lógico",
    " Raciocínio Lógico",
    "Raciocínio Lógico ",
    "Raciocínio  Lógico",
  ];

  const keys = new Set(group.map((item) => logicalKey(item)));

  findings.push({
    area: "Normalizacao",
    severity: keys.size === 1 ? "pass" : "fail",
    scenario: "equivalencia logica ideal",
    detail: `Quantidade de chaves geradas para o grupo: ${keys.size}.`,
  });

  expect(keys.size).toBe(1);
});
