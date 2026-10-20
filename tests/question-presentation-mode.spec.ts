import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import ts from "typescript";
import {
  computeVerticalScale,
  VERTICAL_CANVAS,
  VERTICAL_FIT_LEVELS,
  VERTICAL_FONT_LIMITS,
  VERTICAL_LOGO,
  VERTICAL_SAFE_AREA,
  verticalFitVariables,
} from "@/app/questoes/[id]/preview/page-client";
import {
  getQuestionPresentationPath,
  QUESTION_PRESENTATION_BLOCKED_MESSAGE,
} from "@/lib/questions/question-presentation-window";

// Modo Apresentação de Questões (/questoes/[id]/preview) — Normal e Vertical 9:16.
//
// Os testes de navegador montam o Client Component REAL no Chromium: o
// código-fonte é transpilado pelo TypeScript, empacotado com o React de
// node_modules por um carregador CommonJS mínimo e estilizado com o CSS
// gerado por `npm run build`. Tudo é servido por context.route — nenhum
// servidor Next, nenhuma sessão, nenhum banco. A proteção server-side da
// rota (requireAdminPage) e a ausência de mutações são auditadas no código.

const root = process.cwd();
const ORIGIN = "http://presentation.test";
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const PREVIEW_CLIENT = "app/questoes/[id]/preview/page-client.tsx";
const PREVIEW_PAGE = "app/questoes/[id]/preview/page.tsx";
const APP_SHELL = "app/components/AppShell.tsx";
const BANK_PAGE = "app/questoes/page-client.tsx";
const QUESTION_EDITOR = "app/components/questions/QuestionEditor.tsx";
const WINDOW_HELPER = "lib/questions/question-presentation-window.ts";

// ---------------------------------------------------------------------------
// Fixtures sintéticas
// ---------------------------------------------------------------------------

const svgDataUri = (width: number, height: number, color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`,
  )}`;

const baseMeta = {
  status: "published",
  difficulty_level: 3,
  created_at: "2026-10-20T00:00:00Z",
  discipline: { id: "d1", name: "Direito Constitucional" },
  subjects: { id: "s1", name: "Direitos Fundamentais", disciplines: { id: "d1", name: "Direito Constitucional" } },
  question_subjects: [{ subjects: { id: "s1", name: "Direitos Fundamentais", discipline_id: "d1", disciplines: { id: "d1", name: "Direito Constitucional" } } }],
  exam_boards: { id: "b1", name: "CEBRASPE" },
};

const multipleChoice = (correct: string, texts: string[], extra: Partial<{ image_url: string }> = {}) =>
  texts.map((text, index) => {
    const label = String.fromCharCode(65 + index);
    return { id: `alt-${label}`, label, text, is_correct: label === correct, order_number: index + 1, image_url: null, ...(index === 1 ? extra : {}) };
  });

const LONG_PARAGRAPH =
  "<p>Considere a situação hipotética em que um servidor público, no exercício de suas funções, pratica ato administrativo com desvio de finalidade, e o cidadão prejudicado pretende questionar a validade do ato perante o Poder Judiciário, observando os princípios constitucionais aplicáveis.</p>";

const FIXTURES: Record<string, Record<string, unknown>> = {
  "q-short": {
    id: "q-short",
    code: "ET1001",
    question_type: "multiple_choice",
    statement: "<p>Qual princípio garante a <strong>ampla defesa</strong> nos processos administrativos?</p>",
    explanation_text: "<p>O contraditório e a ampla defesa estão no art. 5º, LV.</p>",
    image_url: null,
    ...baseMeta,
    orgao: "PCMG — Investigador",
    year: 2025,
    question_alternatives: multipleChoice("C", ["Legalidade.", "Moralidade.", "Contraditório e ampla defesa.", "Eficiência.", "Publicidade."]),
  },
  "q-long": {
    id: "q-long",
    code: "ET1002",
    question_type: "multiple_choice",
    statement:
      LONG_PARAGRAPH.repeat(6) +
      "<table><thead><tr><th>Item</th><th>Prazo</th><th>Órgão</th><th>Base</th></tr></thead><tbody><tr><td>Recurso</td><td>10 dias</td><td>TJ</td><td>Lei 9.784</td></tr><tr><td>Revisão</td><td>A qualquer tempo</td><td>STF</td><td>CF/88</td></tr></tbody></table>" +
      LONG_PARAGRAPH.repeat(4),
    explanation_text: null,
    image_url: svgDataUri(2400, 900, "#2563eb"),
    ...baseMeta,
    exam_boards: null,
    orgao: "  TJ-SP ",
    year: null,
    question_alternatives: multipleChoice(
      "D",
      [
        "O ato é válido, pois goza de presunção de legitimidade absoluta e não admite controle judicial em nenhuma hipótese.",
        "O ato pode ser anulado pela própria Administração, mas nunca pelo Judiciário.",
        "O ato é apenas revogável por conveniência e oportunidade.",
        "O ato é nulo por vício de finalidade e pode ser anulado pelo Judiciário mediante provocação do interessado.",
        "O ato convalida-se automaticamente após cinco anos, independentemente de boa-fé.",
      ],
      { image_url: svgDataUri(3000, 600, "#16a34a") },
    ),
  },
  "q-tf": {
    id: "q-tf",
    code: "ET1003",
    question_type: "true_false",
    statement: "<p>A Constituição admite pena de morte em tempo de paz.</p>",
    explanation_text: null,
    image_url: null,
    ...baseMeta,
    orgao: null,
    year: 2023,
    question_alternatives: [
      { id: "tf-c", label: "C", text: "Certo", is_correct: false, order_number: 1, image_url: null },
      { id: "tf-e", label: "E", text: "Errado", is_correct: true, order_number: 2, image_url: null },
    ],
  },
  "q-white": {
    id: "q-white",
    code: "ET1004",
    question_type: "multiple_choice",
    statement: '<p><span style="color: rgb(255, 255, 255); font-size: 10px">Texto colado do editor escuro</span> com <mark>destaque</mark>.</p>',
    explanation_text: null,
    image_url: null,
    discipline: null,
    subjects: null,
    question_subjects: [],
    exam_boards: null,
    orgao: "   ",
    year: null,
    question_alternatives: multipleChoice("A", ['<span style="color:#fff">Alternativa clara</span>', "Outra"]),
  },
};

// Fixtures do ajuste tipográfico do Vertical. Tamanhos calibrados por medição
// real na área de leitura de 1454 px: ~70 palavras cabem reduzindo só
// espaçamento; ~105 exigem redução de fonte; 4 parágrafos não cabem nem no
// mínimo. "fit-40w"/"fit-60w" exigiam redução na área anterior (1150 px).
const PARAGRAPH_WORDS = Array(4).fill(LONG_PARAGRAPH.replace(/<[^>]+>/g, "")).join(" ").split(/\s+/);
const statementOfWords = (count: number) => `<p>${PARAGRAPH_WORDS.slice(0, count).join(" ")}.</p>`;
const LONG_ALTERNATIVE =
  "Considerando a jurisprudência consolidada dos tribunais superiores, a alternativa afirma que o ato administrativo praticado com desvio de finalidade é nulo e pode ser invalidado pelo Poder Judiciário.";
const SHORT_ALTERNATIVES = ["Legalidade.", "Moralidade.", "Contraditório e ampla defesa.", "Eficiência.", "Publicidade."];
const fitFixture = (id: string, statement: string, extra: Record<string, unknown> = {}) => ({
  ...FIXTURES["q-short"],
  id,
  code: id.toUpperCase(),
  statement,
  explanation_text: null,
  question_alternatives: multipleChoice("C", SHORT_ALTERNATIVES),
  ...extra,
});
const LATE_IMAGE_PATH = "/fixtures/late-image.svg";

Object.assign(FIXTURES, {
  "fit-medium": fitFixture("fit-medium", statementOfWords(70)),
  "fit-long": fitFixture("fit-long", statementOfWords(105)),
  "fit-40w": fitFixture("fit-40w", statementOfWords(40)),
  "fit-60w": fitFixture("fit-60w", statementOfWords(60)),
  "fit-60w-comment": fitFixture("fit-60w-comment", statementOfWords(60), { explanation_text: LONG_PARAGRAPH }),
  "fit-very-long": fitFixture("fit-very-long", LONG_PARAGRAPH.repeat(4)),
  "fit-very-long-comment": fitFixture("fit-very-long-comment", LONG_PARAGRAPH.repeat(4), { explanation_text: LONG_PARAGRAPH }),
  "fit-long-alts": fitFixture("fit-long-alts", "<p>Assinale a alternativa correta acerca do controle dos atos administrativos.</p>", {
    question_alternatives: multipleChoice("B", Array(5).fill(LONG_ALTERNATIVE)),
  }),
  "fit-late-image": fitFixture("fit-late-image", statementOfWords(20), { image_url: `${ORIGIN}${LATE_IMAGE_PATH}` }),
});

// ---------------------------------------------------------------------------
// Empacotamento mínimo (CommonJS) do Client Component para o navegador
// ---------------------------------------------------------------------------

const EXTENSIONS = [".tsx", ".ts", ".js", ".cjs", ".json"];

function resolveFile(base: string) {
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => path.join(base, "index" + ext))];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found) throw new Error("Módulo não resolvido: " + base);
  return found;
}

function resolveSpecifier(specifier: string, fromFile: string) {
  if (specifier.startsWith("@/")) return resolveFile(path.join(root, specifier.slice(2)));
  if (specifier.startsWith(".")) return resolveFile(path.resolve(path.dirname(fromFile), specifier));
  return createRequire(fromFile).resolve(specifier);
}

function buildBrowserBundle() {
  const modules = new Map<string, { id: number; code: string; deps: Record<string, number> }>();

  function add(file: string, sourceOverride?: string): number {
    const existing = modules.get(file);
    if (existing) return existing.id;
    const record = { id: modules.size, code: "", deps: {} as Record<string, number> };
    modules.set(file, record);

    let code = sourceOverride ?? fs.readFileSync(file, "utf8");
    if (sourceOverride !== undefined || /\.tsx?$/.test(file)) {
      code = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText;
    }
    if (file.endsWith(".json")) code = "module.exports = " + code;

    for (const match of code.matchAll(/require\((["'])([^"']+)\1\)/g)) {
      const specifier = match[2];
      if (specifier in record.deps) continue;
      try {
        record.deps[specifier] = add(resolveSpecifier(specifier, file));
      } catch {
        // Ramo não executado no navegador (ex.: require citado em comentário).
      }
    }
    record.code = code;
    return record.id;
  }

  const entry = `
    import { createRoot } from "react-dom/client";
    import PreviewQuestaoClient from "@/app/questoes/[id]/preview/page-client";
    import { openQuestionPresentationWindow } from "@/lib/questions/question-presentation-window";
    const w = window as any;
    w.__openPresentation = openQuestionPresentationWindow;
    const element = document.getElementById("root");
    if (element && w.__QUESTION__) createRoot(element).render(<PreviewQuestaoClient question={w.__QUESTION__} />);
  `;
  const entryId = add(path.join(root, "__presentation_entry__.tsx"), entry);

  const definitions = [...modules.values()]
    .sort((a, b) => a.id - b.id)
    .map((record) => `[function(module, exports, require){\n${record.code}\n}, ${JSON.stringify(record.deps)}]`)
    .join(",\n");

  return `(function(){
    var process = { env: { NODE_ENV: "production" } };
    var defs = [${definitions}];
    var cache = {};
    function load(id) {
      if (cache[id]) return cache[id].exports;
      var module = { exports: {} };
      cache[id] = module;
      defs[id][0].call(module.exports, module, module.exports, function (specifier) {
        var dep = defs[id][1][specifier];
        if (dep === undefined) throw new Error("Dependência ausente: " + specifier);
        return load(dep);
      });
      return module.exports;
    }
    load(${entryId});
  })();`;
}

function builtCssFiles() {
  const dir = path.join(root, ".next/static/chunks");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".css")) : [];
  const css = files.map((file) => fs.readFileSync(path.join(dir, file), "utf8")).join("\n");
  if (!css.includes(".h-\\[1920px\\]") || !css.includes(".top-\\[230px\\]") || !css.includes("--vt-statement")) {
    throw new Error("CSS do build não contém as classes do Modo Apresentação. Rode `npm run build` antes desta suíte.");
  }
  return files;
}

let bundleCache: string | null = null;
let cssCache: string[] | null = null;

function htmlFor(questionId: string | null) {
  const links = cssCache!.map((file) => `<link rel="stylesheet" href="/_next/static/chunks/${file}">`).join("");
  const question = questionId ? JSON.stringify(FIXTURES[questionId]).replace(/</g, "\\u003c") : "null";
  const adminButton = questionId
    ? ""
    : `<button id="open" onclick="window.__lastOpen = window.__openPresentation('q-short')">Visualizar</button>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${links}</head><body>${adminButton}<div id="root"></div><script>window.__QUESTION__=${question};</script><script src="/__bundle.js"></script></body></html>`;
}

async function installRoutes(context: BrowserContext, stats: { unexpected: string[]; dataRequests: string[] }) {
  bundleCache ??= buildBrowserBundle();
  cssCache ??= builtCssFiles();

  context.on("request", (request) => {
    if (["fetch", "xhr", "websocket", "eventsource"].includes(request.resourceType()) || request.method() !== "GET") {
      stats.dataRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:") return route.continue();
    if (url.origin !== ORIGIN) {
      stats.unexpected.push(url.href);
      return route.abort();
    }
    const previewMatch = url.pathname.match(/^\/questoes\/([^/]+)\/preview$/);
    if (previewMatch && FIXTURES[decodeURIComponent(previewMatch[1])]) {
      return route.fulfill({ contentType: "text/html", body: htmlFor(decodeURIComponent(previewMatch[1])) });
    }
    if (url.pathname === "/admin") return route.fulfill({ contentType: "text/html", body: htmlFor(null) });
    if (url.pathname === "/__bundle.js") return route.fulfill({ contentType: "text/javascript", body: bundleCache! });
    if (url.pathname === LATE_IMAGE_PATH) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="100%" height="100%" fill="#f97316"/></svg>',
      });
    }
    const staticFile = url.pathname.startsWith("/_next/static/")
      ? path.join(root, ".next", decodeURIComponent(url.pathname.slice("/_next".length)))
      : url.pathname.startsWith("/images/")
        ? path.join(root, "public", decodeURIComponent(url.pathname))
        : null;
    if (staticFile && fs.existsSync(staticFile)) return route.fulfill({ path: staticFile });
    stats.unexpected.push(url.href);
    return route.fulfill({ status: 404, body: "" });
  });
}

async function openPresentation(page: Page, questionId: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/questoes/${questionId}/preview`);
  await expect(page.locator("[data-presentation-toolbar]")).toBeVisible();
  expect(errors).toEqual([]);
}

const modeRadio = (page: Page, name: "Normal" | "Vertical") => page.getByRole("radio", { name });

// Estilos computados da composição Normal (com fonte, gabarito e comentário
// ativos), usados como referência para provar que o ajuste do Vertical não a
// altera.
async function normalSnapshot(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-presentation-composition='normal']")!;
    const pick = (selector: string, props: string[]) => {
      const el = root.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      return Object.fromEntries(props.map((prop) => [prop, style.getPropertyValue(prop)]));
    };
    const box = ["font-size", "line-height", "padding-top", "padding-left", "margin-top", "margin-bottom", "width", "height"];
    return {
      article: (() => {
        const style = getComputedStyle(root);
        return { width: style.width, paddingTop: style.paddingTop, paddingLeft: style.paddingLeft };
      })(),
      source: pick("[data-presentation-source]", box),
      statement: pick("[data-presentation-statement]", box),
      altList: pick("[data-presentation-alternatives]", ["margin-top"]),
      altCardA: pick("[data-presentation-alternative]", box),
      altCardB: pick("[data-presentation-alternative]:nth-child(2)", ["margin-top", "padding-top", "height"]),
      altText: pick("[data-presentation-alternative] .richtext-editor", box),
      badge: pick("[data-presentation-alternative] span", ["width", "height", "font-size"]),
      answer: pick("[data-presentation-answer]", box),
      comment: pick("[data-presentation-comment]", box),
      commentText: pick("[data-presentation-comment] .richtext-editor", box),
    };
  });
}

async function frameMetrics(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector("[data-presentation-frame]") as HTMLElement;
    const canvas = document.querySelector("[data-presentation-canvas]") as HTMLElement;
    const stage = frame.parentElement as HTMLElement;
    const f = frame.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const styles = getComputedStyle(stage);
    const innerWidth = stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const innerHeight = stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
    const expectedScale = Math.min(1, innerWidth / 1080, innerHeight / 1920);
    return {
      width: f.width,
      height: f.height,
      expectedWidth: 1080 * expectedScale,
      fitsStage: f.left >= s.left - 0.5 && f.right <= s.right + 0.5 && f.top >= s.top - 0.5 && f.bottom <= s.bottom + 0.5,
      canvasWidth: canvas.offsetWidth,
      canvasHeight: canvas.offsetHeight,
      visible: getComputedStyle(frame).visibility === "visible",
      documentScrolls: document.scrollingElement!.scrollHeight > window.innerHeight + 1,
    };
  });
}

test.describe("Modo Apresentação de Questões — navegador", () => {
  let context: BrowserContext;
  let page: Page;
  const stats = { unexpected: [] as string[], dataRequests: [] as string[] };

  test.beforeEach(async ({ browser }) => {
    stats.unexpected = [];
    stats.dataRequests = [];
    context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await installRoutes(context, stats);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    expect(stats.dataRequests, "nenhuma chamada de API/mutação durante a apresentação").toEqual([]);
    expect(stats.unexpected).toEqual([]);
    await context.close();
  });

  test("1. Visualizar abre janela popup independente, sem opener, carregando a apresentação", async () => {
    await page.goto(`${ORIGIN}/admin`);
    const [popup] = await Promise.all([context.waitForEvent("page"), page.click("#open")]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe("/questoes/q-short/preview");
    await expect(popup.locator("[data-presentation-toolbar]")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __lastOpen: boolean }).__lastOpen)).toBe(true);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(popup.getByRole("button", { name: "Fechar apresentação" })).toBeVisible();
  });

  test("2. popup bloqueado: helper retorna false para o chamador exibir o aviso", async () => {
    await page.goto(`${ORIGIN}/admin`);
    const result = await page.evaluate(() => {
      window.open = () => null;
      return (window as unknown as { __openPresentation: (id: string) => boolean }).__openPresentation("q-short");
    });
    expect(result).toBe(false);
  });

  test("3. Normal é o padrão: sem layout administrativo, identificação institucional e alto contraste", async () => {
    await openPresentation(page, "q-short");
    await expect(modeRadio(page, "Normal")).toHaveAttribute("aria-checked", "true");
    await expect(modeRadio(page, "Vertical")).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("[data-presentation-composition='normal']")).toBeVisible();
    expect(await page.locator("aside, nav, .et-admin-dark-content, .et-admin-sidebar-slot").count()).toBe(0);

    const logo = page.locator("[data-presentation-composition='normal'] img[alt='EstudoTOP Simulados']");
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // A barra de ferramentas fica fora da composição capturada.
    expect(await page.locator("[data-presentation-composition] [data-presentation-toolbar]").count()).toBe(0);

    const contrast = await page.evaluate(() => {
      const toRgb = (color: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      };
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x);
        return (l1 + 0.05) / (l2 + 0.05);
      };
      const bg = getComputedStyle(document.querySelector("[data-presentation-scroll='normal']")!).backgroundColor;
      const statement = getComputedStyle(document.querySelector("[data-presentation-statement] p")!).color;
      const altCard = document.querySelector("[data-presentation-alternative='A']")!;
      const altText = getComputedStyle(altCard.querySelector(".richtext-editor")!).color;
      const altBg = getComputedStyle(altCard).backgroundColor;
      return { statement: ratio(statement, bg), alternative: ratio(altText, altBg) };
    });
    expect(contrast.statement).toBeGreaterThanOrEqual(7);
    expect(contrast.alternative).toBeGreaterThanOrEqual(7);

    const fontSize = await page.locator("[data-presentation-statement]").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(20);
  });

  test("4. estilos inline herdados (texto branco, fonte minúscula) são neutralizados; destaque preservado", async () => {
    await openPresentation(page, "q-white");
    const result = await page.evaluate(() => {
      const statement = document.querySelector("[data-presentation-statement]") as HTMLElement;
      const span = statement.querySelector("span") as HTMLElement;
      const mark = statement.querySelector("mark") as HTMLElement;
      const altSpan = document.querySelector("[data-presentation-alternative='A'] .richtext-editor span") as HTMLElement;
      return {
        statementColor: getComputedStyle(statement).color,
        spanColor: getComputedStyle(span).color,
        spanSize: getComputedStyle(span).fontSize,
        statementSize: getComputedStyle(statement).fontSize,
        markBg: getComputedStyle(mark).backgroundColor,
        altColor: getComputedStyle(altSpan).color,
        altParentColor: getComputedStyle(altSpan.closest(".richtext-editor")!).color,
      };
    });
    expect(result.spanColor).toBe(result.statementColor);
    expect(result.spanColor).not.toBe("rgb(255, 255, 255)");
    expect(result.spanSize).toBe(result.statementSize);
    expect(result.markBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(result.altColor).toBe(result.altParentColor);
    // Sem Disciplina/Assunto/Banca: nenhum rótulo genérico inventado.
    await expect(page.locator("[data-presentation-meta]")).not.toContainText("Banca");
  });

  test("5. gabarito oculto ao abrir; Mostrar/Ocultar funciona nos dois modos; comentário só sob demanda", async () => {
    await openPresentation(page, "q-short");
    const composition = page.locator("[data-presentation-composition]");
    await expect(composition).not.toContainText("Gabarito");
    expect(await page.locator("[data-revealed-correct]").count()).toBe(0);
    expect(await page.locator("[data-presentation-comment]").count()).toBe(0);
    await expect(page.locator("[data-presentation-alternative='C']")).toContainText("C");

    const toggle = page.getByRole("button", { name: "Mostrar gabarito" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(page.locator("[data-presentation-answer]")).toHaveText(/Gabarito:\s*C/);
    await expect(page.locator("[data-presentation-alternative='C']")).toHaveAttribute("data-revealed-correct", "true");
    expect(await page.locator("[data-revealed-correct]").count()).toBe(1);

    await page.getByRole("button", { name: "Ocultar gabarito" }).click();
    expect(await page.locator("[data-presentation-answer]").count()).toBe(0);
    expect(await page.locator("[data-revealed-correct]").count()).toBe(0);

    await page.getByRole("button", { name: "Mostrar comentário" }).click();
    await expect(page.locator("[data-presentation-comment]")).toContainText("art. 5º, LV");
    await page.getByRole("button", { name: "Ocultar comentário" }).click();
    expect(await page.locator("[data-presentation-comment]").count()).toBe(0);

    await modeRadio(page, "Vertical").click();
    await expect(page.locator("[data-presentation-composition='vertical']")).not.toContainText("Gabarito");
    await page.getByRole("button", { name: "Mostrar gabarito" }).click();
    await expect(page.locator("[data-presentation-composition='vertical'] [data-presentation-answer]")).toHaveText(/Gabarito:\s*C/);
    await page.getByRole("button", { name: "Ocultar gabarito" }).click();
    expect(await page.locator("[data-presentation-answer]").count()).toBe(0);
  });

  test("6. alternância Normal ↔ Vertical sem recarregar, preservando estado; acessível por teclado", async () => {
    await openPresentation(page, "q-short");
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
    await page.getByRole("button", { name: "Mostrar gabarito" }).click();

    await modeRadio(page, "Vertical").click();
    await expect(page.locator("[data-presentation-composition='vertical']")).toBeVisible();
    expect(await page.locator("[data-presentation-composition='normal']").count()).toBe(0);
    await expect(page.locator("[data-presentation-answer]")).toBeVisible();

    await modeRadio(page, "Vertical").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(modeRadio(page, "Normal")).toHaveAttribute("aria-checked", "true");
    await expect(modeRadio(page, "Normal")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(modeRadio(page, "Vertical")).toHaveAttribute("aria-checked", "true");
    await expect(modeRadio(page, "Vertical")).toHaveAttribute("tabindex", "0");
    await expect(modeRadio(page, "Normal")).toHaveAttribute("tabindex", "-1");

    expect(navigations).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(42);
    await expect(page.locator("[data-presentation-answer]")).toBeVisible();
  });

  test("7. Vertical: proporção 9:16 exata, composição 1080×1920 e redimensionamento sem distorção", async () => {
    await openPresentation(page, "q-short");
    await modeRadio(page, "Vertical").click();

    const viewports = [
      { width: 1600, height: 900 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 800, height: 600 },
      { width: 390, height: 844 },
      { width: 2560, height: 1440 },
      { width: 1200, height: 2200 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => {
        const m = await frameMetrics(page);
        // Maior retângulo 9:16 que cabe no palco atual (não a medição anterior ao resize).
        return m.visible && m.fitsStage && Math.abs(m.width - m.expectedWidth) < 0.5 && Math.abs(m.width / m.height - 9 / 16) < 0.002;
      }, { message: `9:16 em ${viewport.width}×${viewport.height}` }).toBe(true);
      const metrics = await frameMetrics(page);
      expect(metrics.canvasWidth).toBe(1080);
      expect(metrics.canvasHeight).toBe(1920);
      expect(metrics.height).toBeLessThanOrEqual(1920 + 0.5);
      expect(metrics.documentScrolls).toBe(false);
    }
    // Janela alta o suficiente: escala 1, composição em tamanho real 1080 × 1920.
    const full = await frameMetrics(page);
    expect(Math.round(full.width)).toBe(1080);
    expect(Math.round(full.height)).toBe(1920);
  });

  test("8. Vertical: identificação no topo e conteúdo dentro da área segura; guia opcional", async () => {
    await page.setViewportSize({ width: 1200, height: 2200 });
    await openPresentation(page, "q-long");
    await modeRadio(page, "Vertical").click();
    await expect.poll(async () => (await frameMetrics(page)).visible).toBe(true);

    const layout = await page.evaluate(() => {
      const canvas = document.querySelector("[data-presentation-canvas]")!.getBoundingClientRect();
      const scale = canvas.width / 1080;
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: (r.top - canvas.top) / scale, bottom: (r.bottom - canvas.top) / scale, left: (r.left - canvas.left) / scale, right: (r.right - canvas.left) / scale };
      };
      const composition = document.querySelector("[data-presentation-composition='vertical']")!;
      return {
        safe: rel(composition.querySelector("[data-presentation-safe-content]")!),
        meta: rel(composition.querySelector("[data-presentation-meta]")!),
        scroll: rel(composition.querySelector("[data-presentation-scroll='vertical']")!),
        logo: rel(composition.querySelector("img[alt='EstudoTOP Simulados']")!),
      };
    });
    expect(layout.safe).toEqual({
      top: VERTICAL_SAFE_AREA.top,
      bottom: VERTICAL_CANVAS.height - VERTICAL_SAFE_AREA.bottom,
      left: VERTICAL_SAFE_AREA.left,
      right: VERTICAL_CANVAS.width - VERTICAL_SAFE_AREA.right,
    });
    for (const box of [layout.meta, layout.scroll]) {
      expect(box.top).toBeGreaterThanOrEqual(layout.safe.top - 0.5);
      expect(box.bottom).toBeLessThanOrEqual(layout.safe.bottom + 0.5);
      expect(box.left).toBeGreaterThanOrEqual(layout.safe.left - 0.5);
      expect(box.right).toBeLessThanOrEqual(layout.safe.right + 0.5);
    }
    expect(layout.logo.bottom).toBeLessThanOrEqual(VERTICAL_SAFE_AREA.top);
    expect(layout.logo.top).toBeGreaterThan(20);

    expect(await page.locator("[data-presentation-safe-guide]").count()).toBe(0);
    await page.getByRole("button", { name: "Área segura" }).click();
    await expect(page.locator("[data-presentation-safe-guide]")).toBeVisible();
    await page.getByRole("button", { name: "Área segura" }).click();
    expect(await page.locator("[data-presentation-safe-guide]").count()).toBe(0);
  });

  test("9. questão curta cabe sem rolagem; extensa rola dentro da área 9:16, sem cortar e no mínimo legível", async () => {
    await openPresentation(page, "q-short");
    await modeRadio(page, "Vertical").click();
    const shortScroll = page.locator("[data-presentation-scroll='vertical']");
    expect(await shortScroll.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

    await page.goto(`${ORIGIN}/questoes/q-long/preview`);
    await modeRadio(page, "Vertical").click();
    const scroll = page.locator("[data-presentation-scroll='vertical']");
    const before = await scroll.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
    expect(before.overflowY).toBe("auto");

    const sizes = await page.evaluate(() => ({
      statement: parseFloat(getComputedStyle(document.querySelector("[data-presentation-composition='vertical'] [data-presentation-statement]")!).fontSize),
      alternative: parseFloat(getComputedStyle(document.querySelector("[data-presentation-composition='vertical'] [data-presentation-alternative='A'] .richtext-editor")!).fontSize),
    }));
    // Não cabe nem no mínimo: tipografia fica no limite legível e a área rola.
    expect(sizes.statement).toBe(30);
    expect(sizes.alternative).toBe(28);

    await scroll.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const end = await scroll.evaluate((el) => {
      const last = el.querySelector("[data-presentation-alternative='E']")!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { scrollTop: el.scrollTop, lastVisible: last.bottom <= box.bottom + 1 && last.top >= box.top - 1 };
    });
    expect(end.scrollTop).toBeGreaterThan(0);
    expect(end.lastVisible).toBe(true);
    expect((await frameMetrics(page)).documentScrolls).toBe(false);
  });

  test("10. imagens e tabelas respeitam a largura nos dois modos", async () => {
    await openPresentation(page, "q-long");
    for (const mode of ["Normal", "Vertical"] as const) {
      await modeRadio(page, mode).click();
      const composition = `[data-presentation-composition='${mode === "Normal" ? "normal" : "vertical"}']`;
      const overflow = await page.evaluate((selector) => {
        const root = document.querySelector(selector)!;
        const statement = root.querySelector("[data-presentation-statement]") as HTMLElement;
        const issues: string[] = [];
        root.querySelectorAll("img").forEach((img) => {
          const container = (img.closest("[data-presentation-alternative] .min-w-0, [data-presentation-statement]") || img.parentElement!) as HTMLElement;
          if (img.getBoundingClientRect().width > container.getBoundingClientRect().width + 1) issues.push("img " + img.alt);
        });
        const table = statement.querySelector("table")!;
        if (table.getBoundingClientRect().width > statement.getBoundingClientRect().width + 1) issues.push("table");
        if (statement.scrollWidth > statement.clientWidth + 1) issues.push("statement overflow");
        return { issues, images: root.querySelectorAll("img").length, cells: table.querySelectorAll("td").length };
      }, composition);
      expect(overflow.issues).toEqual([]);
      expect(overflow.images).toBe(3);
      expect(overflow.cells).toBe(8);
    }
  });

  test("11. Certo/Errado: duas opções; gabarito Errado destacado em vermelho", async () => {
    await openPresentation(page, "q-tf");
    const alternatives = page.locator("[data-presentation-composition] [data-presentation-alternative]");
    await expect(alternatives).toHaveCount(2);
    await expect(alternatives.nth(0)).toContainText("Certo");
    await expect(alternatives.nth(1)).toContainText("Errado");
    await page.getByRole("button", { name: "Mostrar gabarito" }).click();
    // getStudentAlternatives normaliza os rótulos de Certo/Errado.
    const errado = page.locator("[data-presentation-alternative='Errado']");
    await expect(errado).toHaveAttribute("data-revealed-correct", "true");
    await expect(errado).toHaveClass(/border-red-400/);
    expect(await page.locator("[data-presentation-alternative='Certo'][data-revealed-correct]").count()).toBe(0);
    await expect(page.locator("[data-presentation-answer]")).toHaveText(/Gabarito:\s*Errado/);
    expect(await page.getByRole("button", { name: "Mostrar comentário" }).count()).toBe(0);
  });

  test("12. múltipla escolha: letras A–E e metadados (disciplina, assunto, banca)", async () => {
    await openPresentation(page, "q-short");
    const labels = await page.locator("[data-presentation-composition] [data-presentation-alternative]").evaluateAll((els) => els.map((el) => el.getAttribute("data-presentation-alternative")));
    expect(labels).toEqual(["A", "B", "C", "D", "E"]);
    const meta = page.locator("[data-presentation-composition='normal'] [data-presentation-meta]");
    await expect(meta).toContainText("Direito Constitucional");
    await expect(meta).toContainText("Direitos Fundamentais");
    await expect(meta).toContainText("CEBRASPE");
  });

  test("13. Mostrar fonte: oculta ao abrir, exibe Banca • Concurso • Ano antes do enunciado e oculta de novo", async () => {
    await openPresentation(page, "q-short");
    const source = page.locator("[data-presentation-source]");
    const toggle = page.getByRole("button", { name: "Mostrar fonte" });
    expect(await source.count()).toBe(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(source).toHaveCount(1);
    await expect(source).toHaveText(/Fonte\s*CEBRASPE • PCMG — Investigador • 2025/);
    await expect(page.getByRole("button", { name: "Ocultar fonte" })).toHaveAttribute("aria-pressed", "true");

    // Dentro da composição gravável, imediatamente antes do enunciado e menor que ele.
    const placement = await source.evaluate((el) => ({
      insideComposition: Boolean(el.closest("[data-presentation-composition]")),
      nextIsStatement: el.nextElementSibling?.hasAttribute("data-presentation-statement") ?? false,
      sourceSize: parseFloat(getComputedStyle(el).fontSize),
      statementSize: parseFloat(getComputedStyle(el.nextElementSibling as Element).fontSize),
    }));
    expect(placement.insideComposition).toBe(true);
    expect(placement.nextIsStatement).toBe(true);
    expect(placement.sourceSize).toBeLessThan(placement.statementSize);

    await page.getByRole("button", { name: "Ocultar fonte" }).click();
    expect(await source.count()).toBe(0);

    // Teclado: Enter e Espaço alternam o controle.
    await page.getByRole("button", { name: "Mostrar fonte" }).focus();
    await page.keyboard.press("Enter");
    await expect(source).toHaveCount(1);
    await page.keyboard.press("Space");
    expect(await source.count()).toBe(0);
  });

  test("14. Mostrar fonte: estado preservado entre os modos, sem afetar gabarito/comentário; Vertical na área segura", async () => {
    await page.setViewportSize({ width: 1200, height: 2200 });
    await openPresentation(page, "q-short");
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    // Desativada permanece desativada ao alternar.
    await modeRadio(page, "Vertical").click();
    expect(await page.locator("[data-presentation-source]").count()).toBe(0);
    await modeRadio(page, "Normal").click();

    await page.getByRole("button", { name: "Mostrar fonte" }).click();
    await modeRadio(page, "Vertical").click();
    const verticalSource = page.locator("[data-presentation-composition='vertical'] [data-presentation-source]");
    await expect(verticalSource).toHaveText(/CEBRASPE • PCMG — Investigador • 2025/);
    expect(await page.locator("[data-presentation-answer]").count()).toBe(0);
    expect(await page.locator("[data-presentation-comment]").count()).toBe(0);

    const inSafeArea = await verticalSource.evaluate((el) => {
      const scroll = el.closest("[data-presentation-scroll='vertical']")!;
      const safe = el.closest("[data-presentation-safe-content]")!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return Boolean(scroll) && r.top >= safe.top - 0.5 && r.left >= safe.left - 0.5 && r.right <= safe.right + 0.5;
    });
    expect(inSafeArea).toBe(true);

    await page.getByRole("button", { name: "Mostrar gabarito" }).click();
    await page.getByRole("button", { name: "Mostrar comentário" }).click();
    await modeRadio(page, "Normal").click();
    await expect(page.locator("[data-presentation-composition='normal'] [data-presentation-source]")).toBeVisible();
    await expect(page.locator("[data-presentation-answer]")).toBeVisible();
    await expect(page.locator("[data-presentation-comment]")).toBeVisible();

    await page.getByRole("button", { name: "Ocultar fonte" }).click();
    await expect(page.locator("[data-presentation-answer]")).toBeVisible();
    await expect(page.locator("[data-presentation-comment]")).toBeVisible();
    expect(navigations).toBe(0);

    // Nova pré-visualização começa com a fonte desativada.
    await page.getByRole("button", { name: "Mostrar fonte" }).click();
    await page.goto(`${ORIGIN}/questoes/q-short/preview`);
    await expect(page.getByRole("button", { name: "Mostrar fonte" })).toHaveAttribute("aria-pressed", "false");
    expect(await page.locator("[data-presentation-source]").count()).toBe(0);
  });

  test("15. Mostrar fonte: campos parciais omitidos; nenhum dado mostra indicação discreta", async () => {
    const cases: [string, RegExp][] = [
      ["q-tf", /^Fonte\s*CEBRASPE • 2023$/],
      ["q-long", /^Fonte\s*TJ-SP$/],
      ["q-white", /^Fonte\s*Fonte não informada$/],
    ];
    for (const [questionId, expected] of cases) {
      await page.goto(`${ORIGIN}/questoes/${questionId}/preview`);
      await page.getByRole("button", { name: "Mostrar fonte" }).click();
      for (const mode of ["Normal", "Vertical"] as const) {
        await modeRadio(page, mode).click();
        await expect(page.locator("[data-presentation-source]")).toHaveText(expected);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Ajuste tipográfico inteligente do Vertical
// ---------------------------------------------------------------------------

const LAST_FIT_LEVEL = VERTICAL_FIT_LEVELS.length - 1;

async function verticalFit(page: Page) {
  return page.locator("[data-presentation-scroll='vertical']").evaluate((scroll: HTMLElement) => {
    const size = (selector: string) => {
      const el = scroll.querySelector(selector);
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    };
    const card = scroll.querySelector("[data-presentation-alternative]")!;
    const horizontal = [scroll, ...Array.from(scroll.querySelectorAll<HTMLElement>("[data-presentation-statement], [data-presentation-alternative] .richtext-editor"))]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.getAttribute("data-presentation-statement") !== null ? "statement" : el.className.slice(0, 30));
    return {
      level: Number(scroll.dataset.fitLevel),
      overflow: scroll.dataset.fitOverflow === "true",
      scrollable: scroll.scrollHeight > scroll.clientHeight,
      statement: size("[data-presentation-statement]")!,
      alternative: size("[data-presentation-alternative] .richtext-editor")!,
      source: size("[data-presentation-source] span:last-child"),
      cardPadding: parseFloat(getComputedStyle(card).paddingTop),
      horizontal,
    };
  });
}

async function openVertical(page: Page, questionId: string) {
  await openPresentation(page, questionId);
  await modeRadio(page, "Vertical").click();
  await expect(page.locator("[data-presentation-scroll='vertical'][data-fit-level]")).toHaveCount(1);
}

// Todo o conteúdo é alcançável pela rolagem: ao fim, o último bloco fica visível.
async function lastBlockReachable(page: Page) {
  return page.locator("[data-presentation-scroll='vertical']").evaluate((scroll: HTMLElement) => {
    scroll.scrollTop = scroll.scrollHeight;
    const blocks = scroll.querySelectorAll("[data-presentation-alternative], [data-presentation-answer], [data-presentation-comment]");
    const last = blocks[blocks.length - 1].getBoundingClientRect();
    const box = scroll.getBoundingClientRect();
    const reachable = last.bottom <= box.bottom + 1 && last.top >= box.top - 1;
    scroll.scrollTop = 0;
    return reachable;
  });
}

function expectLegible(fit: Awaited<ReturnType<typeof verticalFit>>) {
  expect(fit.statement).toBeGreaterThanOrEqual(VERTICAL_FONT_LIMITS.statement.min);
  expect(fit.alternative).toBeGreaterThanOrEqual(VERTICAL_FONT_LIMITS.alternative.min);
  if (fit.source !== null) expect(fit.source).toBeGreaterThanOrEqual(VERTICAL_FONT_LIMITS.source.min);
  expect(fit.horizontal).toEqual([]);
  expect(fit.overflow).toBe(fit.scrollable);
}

test.describe("Modo Vertical — ajuste tipográfico inteligente", () => {
  let context: BrowserContext;
  let page: Page;
  const stats = { unexpected: [] as string[], dataRequests: [] as string[] };

  test.beforeEach(async ({ browser }) => {
    stats.unexpected = [];
    stats.dataRequests = [];
    // Janela alta: escala 1, composição exibida em 1080 × 1920 nativos.
    context = await browser.newContext({ viewport: { width: 1200, height: 2200 } });
    await installRoutes(context, stats);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    expect(stats.dataRequests).toEqual([]);
    expect(stats.unexpected).toEqual([]);
    await context.close();
  });

  test("F1. níveis: começam no layout original, reduzem espaçamento antes da fonte e param nos mínimos", () => {
    const first = VERTICAL_FIT_LEVELS[0];
    const last = VERTICAL_FIT_LEVELS[LAST_FIT_LEVEL];
    expect(first).toMatchObject({ statement: 38, alternative: 34, source: 26, answer: 32, comment: 30, spacing: 1 });
    expect(last).toMatchObject({ statement: 30, alternative: 28, source: 24, spacing: 0.55 });
    const firstFontReduction = VERTICAL_FIT_LEVELS.findIndex((level) => level.statement < 38);
    expect(VERTICAL_FIT_LEVELS.slice(0, firstFontReduction).every((level) => level.statement === 38 && level.alternative === 34)).toBe(true);
    expect(VERTICAL_FIT_LEVELS[firstFontReduction - 1].spacing).toBe(0.55);
    for (let index = 1; index < VERTICAL_FIT_LEVELS.length; index += 1) {
      const [previous, current] = [VERTICAL_FIT_LEVELS[index - 1], VERTICAL_FIT_LEVELS[index]];
      for (const key of ["statement", "alternative", "source", "spacing"] as const) expect(current[key]).toBeLessThanOrEqual(previous[key]);
      expect(current.statement).toBeGreaterThan(current.alternative);
      expect(current.alternative).toBeGreaterThanOrEqual(VERTICAL_FONT_LIMITS.alternative.min);
      expect(current.source).toBeGreaterThanOrEqual(VERTICAL_FONT_LIMITS.source.min);
    }
  });

  test("F2. curta mantém o layout original; Certo/Errado também", async () => {
    for (const id of ["q-short", "q-tf"]) {
      await openVertical(page, id);
      const fit = await verticalFit(page);
      expect(fit).toMatchObject({ level: 0, overflow: false, statement: 38, alternative: 34, cardPadding: 32 });
      expectLegible(fit);
    }
  });

  test("F3. média: reduz só espaçamentos, mantendo 38/34 px, e cabe sem rolagem", async () => {
    await openVertical(page, "fit-medium");
    const fit = await verticalFit(page);
    expect(fit.level).toBeGreaterThan(0);
    expect(fit.statement).toBe(38);
    expect(fit.alternative).toBe(34);
    expect(fit.cardPadding).toBeLessThan(32);
    expect(fit.overflow).toBe(false);
    expectLegible(fit);
  });

  test("F4. longa: reduz tipografia progressivamente acima dos mínimos e cabe sem rolagem", async () => {
    await openVertical(page, "fit-long");
    const fit = await verticalFit(page);
    expect(fit.level).toBeGreaterThan(VERTICAL_FIT_LEVELS.findIndex((level) => level.statement < 38) - 1);
    expect(fit.level).toBeLessThan(LAST_FIT_LEVEL);
    expect(fit.statement).toBeLessThan(38);
    expect(fit.statement).toBeGreaterThan(30);
    expect(fit.overflow).toBe(false);
    expect(fit.statement).toBe(VERTICAL_FIT_LEVELS[fit.level].statement);
    expect(fit.alternative).toBe(VERTICAL_FIT_LEVELS[fit.level].alternative);
    expectLegible(fit);
  });

  test("F5. muito longa e imagem+tabela: mínimo legível, rolagem e nada cortado", async () => {
    for (const id of ["fit-very-long", "q-long"]) {
      await openVertical(page, id);
      const fit = await verticalFit(page);
      expect(fit, id).toMatchObject({ level: LAST_FIT_LEVEL, overflow: true, scrollable: true, statement: 30, alternative: 28 });
      expectLegible(fit);
      expect(await lastBlockReachable(page)).toBe(true);
      expect((await frameMetrics(page)).documentScrolls).toBe(false);
    }
  });

  test("F6. fonte, gabarito e comentário recalculam o ajuste nos dois sentidos, sem histerese", async () => {
    await openVertical(page, "fit-medium");
    const base = await verticalFit(page);

    await page.getByRole("button", { name: "Mostrar fonte" }).click();
    const withSource = await verticalFit(page);
    expect(withSource.source).toBe(VERTICAL_FIT_LEVELS[withSource.level].source);
    expect(withSource.level).toBeGreaterThanOrEqual(base.level);

    await page.getByRole("button", { name: "Mostrar gabarito" }).click();
    const withAnswer = await verticalFit(page);
    expect(withAnswer.level).toBeGreaterThan(withSource.level);
    expectLegible(withAnswer);
    expect(await lastBlockReachable(page)).toBe(true);

    await page.getByRole("button", { name: "Ocultar gabarito" }).click();
    expect((await verticalFit(page)).level).toBe(withSource.level);
    await page.getByRole("button", { name: "Ocultar fonte" }).click();
    expect((await verticalFit(page)).level).toBe(base.level);

    await openVertical(page, "fit-60w-comment");
    const commentBase = await verticalFit(page);
    await page.getByRole("button", { name: "Mostrar comentário" }).click();
    const withComment = await verticalFit(page);
    expect(withComment.level).toBeGreaterThan(commentBase.level);
    expectLegible(withComment);
    expect(await lastBlockReachable(page)).toBe(true);
    await page.getByRole("button", { name: "Ocultar comentário" }).click();
    expect((await verticalFit(page)).level).toBe(commentBase.level);
  });

  test("F7. alternância Normal/Vertical e redimensionamento não alteram o ajuste nem a composição 9:16", async () => {
    await openVertical(page, "fit-long");
    const reference = await verticalFit(page);

    await modeRadio(page, "Normal").click();
    await modeRadio(page, "Vertical").click();
    expect(await verticalFit(page)).toEqual(reference);

    for (const viewport of [{ width: 800, height: 600 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => {
        const m = await frameMetrics(page);
        return Math.abs(m.width - m.expectedWidth) < 0.5 && Math.abs(m.width / m.height - 9 / 16) < 0.002;
      }).toBe(true);
      // Escala externa não interfere: mesmas medidas nativas.
      expect(await verticalFit(page)).toEqual(reference);
      const metrics = await frameMetrics(page);
      expect([metrics.canvasWidth, metrics.canvasHeight]).toEqual([1080, 1920]);
    }
  });

  test("F8. imagem carregada depois recalcula uma vez e estabiliza, sem oscilação", async () => {
    await openVertical(page, "fit-late-image");
    expect((await verticalFit(page)).level).toBe(0);

    const changes = page.locator("[data-presentation-scroll='vertical']").evaluate((scroll: HTMLElement) => new Promise<number>((resolve) => {
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(scroll, { attributes: true, attributeFilter: ["data-fit-level", "style"] });
      const image = scroll.querySelector("img")!;
      const finish = () => setTimeout(() => {
        observer.disconnect();
        resolve(count);
      }, 50);
      if (image.complete && image.naturalWidth > 0) finish();
      else image.addEventListener("load", finish, { once: true });
    }));
    expect(await changes).toBeGreaterThan(0);

    await expect.poll(async () => (await verticalFit(page)).level).toBeGreaterThan(0);
    const settled = await verticalFit(page);
    expectLegible(settled);
    expect(await lastBlockReachable(page)).toBe(true);

    // Nenhuma mudança adicional depois de estabilizar.
    const later = await page.locator("[data-presentation-scroll='vertical']").evaluate((scroll: HTMLElement) => new Promise<number>((resolve) => {
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(scroll, { attributes: true, attributeFilter: ["data-fit-level", "style"] });
      setTimeout(() => {
        observer.disconnect();
        resolve(count);
      }, 1500);
    }));
    expect(later).toBe(0);
    expect(await verticalFit(page)).toEqual(settled);
  });

  // Área de leitura antes da correção de aproveitamento vertical (top 250, base 380).
  const PREVIOUS_READING_HEIGHT = 1150;

  async function readingGeometry() {
    return page.evaluate(() => {
      const canvas = document.querySelector("[data-presentation-composition='vertical']")!.getBoundingClientRect();
      const scale = canvas.height / 1920;
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: (r.top - canvas.top) / scale, bottom: (r.bottom - canvas.top) / scale };
      };
      const scroll = document.querySelector("[data-presentation-scroll='vertical']") as HTMLElement;
      return {
        scroll: rel(scroll),
        clientHeight: scroll.clientHeight,
        logo: rel(document.querySelector("[data-presentation-composition='vertical'] img[alt='EstudoTOP Simulados']")!),
        meta: rel(document.querySelector("[data-presentation-composition='vertical'] [data-presentation-meta]")!),
      };
    });
  }

  // Aplica temporariamente o nível anterior ao escolhido e verifica que ele não
  // caberia: prova que a redução aplicada é a mínima necessária.
  async function previousLevelOverflows(level: number) {
    return page.locator("[data-presentation-scroll='vertical']").evaluate((scroll: HTMLElement, vars: Record<string, string>) => {
      const original = Object.keys(vars).map((name) => [name, scroll.style.getPropertyValue(name)] as const);
      for (const [name, value] of Object.entries(vars)) scroll.style.setProperty(name, value);
      const overflows = scroll.scrollHeight > scroll.clientHeight;
      for (const [name, value] of original) scroll.style.setProperty(name, value);
      return overflows;
    }, verticalFitVariables(VERTICAL_FIT_LEVELS[level - 1]));
  }

  test("G1. área de leitura ocupa a altura útil: logomarca preservada, base de 96 px, sem região vazia artificial", async () => {
    for (const id of ["q-short", "fit-very-long"]) {
      await openVertical(page, id);
      const geometry = await readingGeometry();
      expect(geometry.logo).toEqual({ top: VERTICAL_LOGO.top, bottom: VERTICAL_LOGO.top + VERTICAL_LOGO.height });
      expect(geometry.meta.top).toBe(VERTICAL_SAFE_AREA.top);
      expect(geometry.meta.top - geometry.logo.bottom).toBeLessThanOrEqual(24);
      expect(geometry.scroll.bottom).toBe(VERTICAL_CANVAS.height - VERTICAL_SAFE_AREA.bottom);
      expect(VERTICAL_SAFE_AREA.bottom).toBe(VERTICAL_SAFE_AREA.left);
      expect(VERTICAL_CANVAS.height - geometry.scroll.bottom).toBeLessThanOrEqual(96);
      expect(geometry.clientHeight).toBeGreaterThanOrEqual(PREVIOUS_READING_HEIGHT + 300);
      expect(geometry.clientHeight / VERTICAL_CANVAS.height).toBeGreaterThan(0.75);
    }
  });

  test("G2. redução sempre mínima: o nível anterior ao escolhido não caberia", async () => {
    const scenarios: [string, string[]][] = [
      ["fit-medium", []],
      ["fit-long", []],
      ["fit-long-alts", []],
      ["fit-60w", ["Mostrar fonte", "Mostrar gabarito"]],
      ["q-short", ["Mostrar fonte", "Mostrar gabarito", "Mostrar comentário"]],
    ];
    for (const [id, toggles] of scenarios) {
      await openVertical(page, id);
      for (const name of toggles) await page.getByRole("button", { name }).click();
      const fit = await verticalFit(page);
      expect(fit.overflow, id).toBe(false);
      expectLegible(fit);
      if (fit.level > 0) expect(await previousLevelOverflows(fit.level), `${id} nível ${fit.level}`).toBe(true);
    }
  });

  test("G3. antes x depois: conteúdo que exigia redução na área de 1150 px agora usa fontes maiores", async () => {
    // Medido na área anterior: 40 palavras → nível 2; 60 palavras → 35 px;
    // cinco alternativas extensas → mínimo com rolagem.
    await openVertical(page, "fit-40w");
    expect(await verticalFit(page)).toMatchObject({ level: 0, statement: 38, alternative: 34, overflow: false });
    await openVertical(page, "fit-60w");
    expect(await verticalFit(page)).toMatchObject({ statement: 38, alternative: 34, overflow: false });
    await openVertical(page, "fit-long-alts");
    const alts = await verticalFit(page);
    expect(alts.overflow).toBe(false);
    expect(alts.alternative).toBeGreaterThan(VERTICAL_FONT_LIMITS.alternative.min);
    expect(await lastBlockReachable(page)).toBe(true);
  });

  test("G4. muito longa com fonte, gabarito e comentário: rolagem usa toda a altura até o último bloco", async () => {
    await openVertical(page, "fit-very-long-comment");
    for (const name of ["Mostrar fonte", "Mostrar gabarito", "Mostrar comentário"]) await page.getByRole("button", { name }).click();
    const fit = await verticalFit(page);
    expect(fit).toMatchObject({ level: LAST_FIT_LEVEL, overflow: true, statement: 30, alternative: 28, source: 24 });
    expectLegible(fit);
    const geometry = await readingGeometry();
    expect(geometry.scroll.bottom).toBe(VERTICAL_CANVAS.height - VERTICAL_SAFE_AREA.bottom);
    expect(await lastBlockReachable(page)).toBe(true);
  });

  test("F9. Modo Normal idêntico à referência anterior ao ajuste do Vertical", async () => {
    const golden = JSON.parse(read("tests/question-presentation-normal-golden.json"));
    for (const viewport of [{ width: 1600, height: 900 }, { width: 700, height: 900 }]) {
      await page.setViewportSize(viewport);
      for (const id of ["q-short", "q-long", "q-tf"]) {
        await page.goto(`${ORIGIN}/questoes/${id}/preview`);
        // Passar pelo Vertical antes não pode contaminar o Normal.
        await modeRadio(page, "Vertical").click();
        await modeRadio(page, "Normal").click();
        await page.getByRole("button", { name: "Mostrar fonte" }).click();
        await page.getByRole("button", { name: "Mostrar gabarito" }).click();
        const comment = page.getByRole("button", { name: "Mostrar comentário" });
        if (await comment.count()) await comment.click();
        expect(await normalSnapshot(page), `${viewport.width}:${id}`).toEqual(golden[`${viewport.width}:${id}`]);
      }
    }
    expect(await page.locator("[data-presentation-composition='normal'] [data-fit-level]").count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Auditorias de código: proteção, ausência de mutações, pontos de entrada
// ---------------------------------------------------------------------------

test.describe("Modo Apresentação de Questões — contratos de código", () => {
  test("escala vertical: nunca distorce, nunca amplia além de 1080 × 1920", () => {
    expect(computeVerticalScale(1080, 1920)).toBe(1);
    expect(computeVerticalScale(4000, 4000)).toBe(1);
    expect(computeVerticalScale(540, 1920)).toBe(0.5);
    expect(computeVerticalScale(1080, 960)).toBe(0.5);
    expect(computeVerticalScale(0, 900)).toBe(0);
    expect(VERTICAL_CANVAS.width / VERTICAL_CANVAS.height).toBe(9 / 16);
  });

  test("rota protegida: requireAdminPage antes de qualquer leitura; somente SELECT", () => {
    const source = read(PREVIEW_PAGE);
    const guard = source.indexOf("await requireAdminPage()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf("createSupabaseAdminClient()"));
    expect(source).toContain(".select(");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    // Campos de origem (Mostrar fonte) apenas lidos.
    expect(source).toMatch(/\n\s+year,\n\s+orgao,\n/);
  });

  test("client somente leitura: sem fetch, Supabase ou APIs", () => {
    const source = read(PREVIEW_CLIENT);
    expect(source).not.toMatch(/\bfetch\(|adminFetch|supabase|\/api\//i);
  });

  test("AppShell trata a apresentação como rota de foco (sem sidebar/header administrativos)", () => {
    const source = read(APP_SHELL);
    const block = source.slice(source.indexOf("const isFocusRoute"), source.indexOf("const isStudentSimulationRoute"));
    expect(block).toContain("/^\\/questoes\\/[^/]+\\/preview$/.test(pathname)");
    const regex = /^\/questoes\/[^/]+\/preview$/;
    expect(regex.test(getQuestionPresentationPath("abc-123"))).toBe(true);
    expect(regex.test("/questoes/abc-123/editar")).toBe(false);
    expect(regex.test("/questoes")).toBe(false);
    expect(regex.test("/questoes/abc/preview/extra")).toBe(false);
  });

  test("helper abre popup redimensionável, detecta bloqueio e desfaz o opener", () => {
    const source = read(WINDOW_HELPER);
    const features = source.match(/`popup=yes[^`]*`/)?.[0] || "";
    expect(features).toContain("resizable=yes");
    expect(features).toContain("scrollbars=yes");
    expect(features).not.toContain("noopener");
    expect(source).toContain("popup.opener = null");
    expect(source).toMatch(/if \(!popup\) return false;/);
  });

  test("Visualizar do Banco de Questões e do editor usam a janela de apresentação e tratam bloqueio", () => {
    const bank = read(BANK_PAGE);
    expect(bank).not.toContain('href={`/questoes/${question.id}/preview`}');
    expect(bank).toMatch(/if \(!openQuestionPresentationWindow\(question\.id\)\) \{\s*setFeedback\(\{ type: "warning", message: QUESTION_PRESENTATION_BLOCKED_MESSAGE \}\);/);

    const editor = read(QUESTION_EDITOR);
    expect(editor).not.toContain('window.open(`/questoes/${question.id}/preview`');
    expect(editor).toContain("if (!openQuestionPresentationWindow(question.id)) onError?.(QUESTION_PRESENTATION_BLOCKED_MESSAGE);");
    expect(QUESTION_PRESENTATION_BLOCKED_MESSAGE).toMatch(/pop-ups/);
  });

  test("preservação: alterações restritas ao Modo Apresentação", () => {
    const allowed = new Set([
      APP_SHELL,
      QUESTION_EDITOR,
      BANK_PAGE,
      PREVIEW_PAGE,
      PREVIEW_CLIENT,
      WINDOW_HELPER,
      "tests/question-presentation-mode.spec.ts",
      "tests/question-presentation-normal-golden.json",
      "docs/INDICE_FUNCOES_SISTEMA.md",
      "docs/Sprint-simulados.md",
      "docs/status-atual.md",
    ]);
    const changed = execSync("git status --porcelain --untracked-files=all", { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).replace(/^"|"$/g, ""));
    expect(changed.filter((file) => !allowed.has(file))).toEqual([]);
  });
});
