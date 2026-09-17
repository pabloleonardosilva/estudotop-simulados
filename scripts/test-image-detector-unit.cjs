/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = new Map();
function loadTypeScript(filePath) {
  const absolute = path.resolve(filePath);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const loadedModule = { exports: {} };
  cache.set(absolute, loadedModule);
  const source = fs.readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (request) => {
    if (request === "server-only") return {};
    if (request.startsWith("./")) return loadTypeScript(path.resolve(path.dirname(absolute), `${request}.ts`));
    if (request.startsWith("@/")) return loadTypeScript(path.resolve(request.slice(2) + ".ts"));
    return require(request);
  };
  new Function("require", "module", "exports", "__filename", "__dirname", output)(localRequire, loadedModule, loadedModule.exports, absolute, path.dirname(absolute));
  return loadedModule.exports;
}

const imagePending = loadTypeScript("lib/questions/image-pending.ts");

// CASO A — imagem real: continua detectada, mesmo com uma extensão de imagem "isolada" no meio da frase.
{
  const statement = "Observe a imagem figura01.png a seguir.";
  const occurrences = imagePending.findCandidateImageOccurrences(statement);
  assert.equal(occurrences.length, 1, "CASO A: figura01.png deveria continuar sendo candidata a imagem");
  assert.equal(occurrences[0].rejected, false);
  assert.equal(occurrences[0].text, "figura01.png");
  assert.equal(imagePending.isQuestionImagePending({ statement }), true, "CASO A: questão deveria continuar marcada como imagem pendente");
}

// CASO B — enumeração de nomes de arquivo: logotipo.png não deve ser tratado como imagem real.
{
  const statement = "Considere os arquivos gastos_mensais.xlsx, contrato-de-seguranca.pdf e logotipo.png.";
  const occurrences = imagePending.findCandidateImageOccurrences(statement);
  assert.equal(occurrences.length, 0, "CASO B: logotipo.png não deveria nem aparecer como candidata (heurística confiante)");
  assert.equal(imagePending.isQuestionImagePending({ statement }), false, "CASO B: questão não deveria ficar marcada como imagem pendente");
}

// Variante do CASO B: heurística também reage à frase-gatilho negativa, sem exigir extensão de documento por perto.
{
  const statement = "Qual aplicativo abre o arquivo relatorio.png?";
  const occurrences = imagePending.findCandidateImageOccurrences(statement);
  assert.equal(occurrences.length, 0, "Frase-gatilho negativa sozinha já deveria excluir a referência");
}

// Sinal positivo sempre prevalece sobre negativo, mesmo perto de outras extensões.
{
  const statement = "Envie os arquivos dados.csv e relatorio.docx. Observe a imagem grafico.png a seguir para responder.";
  const occurrences = imagePending.findCandidateImageOccurrences(statement);
  const grafico = occurrences.find((o) => o.text === "grafico.png");
  assert.ok(grafico, "Sinal positivo próximo deveria manter grafico.png como candidata mesmo com extensões de documento na mesma frase");
  assert.equal(grafico.rejected, false);
}

// CASO C — caso ambíguo: sem sinal forte nenhum, mantém compatibilidade (ainda candidata a imagem).
{
  const statement = "Anexo: logotipo.png";
  const occurrences = imagePending.findCandidateImageOccurrences(statement);
  assert.equal(occurrences.length, 1, "CASO C: sem sinal forte, deve permanecer como possível imagem (compatibilidade)");
  assert.equal(occurrences[0].rejected, false);
}

// CASO C (continuação) — professor rejeita manualmente; texto original permanece exatamente igual.
{
  const statement = "Anexo: logotipo.png";
  const occurrence = imagePending.findCandidateImageOccurrences(statement)[0];
  const rejectedHtml = imagePending.toggleImageOccurrenceRejection(statement, occurrence);
  assert.equal(rejectedHtml, 'Anexo: <span data-image-ref="rejected">logotipo.png</span>');
  assert.ok(rejectedHtml.includes("logotipo.png"), "REGRA 24: o texto original nunca pode ser removido/alterado");
  const afterReject = imagePending.findCandidateImageOccurrences(rejectedHtml);
  assert.equal(afterReject.length, 1);
  assert.equal(afterReject[0].rejected, true);
  assert.equal(afterReject[0].text, "logotipo.png");
  assert.equal(imagePending.isQuestionImagePending({ statement: rejectedHtml }), false, "CASO E: única imagem detectada rejeitada -> estado azul deve sumir");
}

// CASO D — múltiplas referências: rejeitar uma não afeta as demais.
{
  const statement = "Compare imagem1.png com imagem2.jpg e também logotipo.png no rodapé.";
  let occurrences = imagePending.findCandidateImageOccurrences(statement);
  assert.equal(occurrences.length, 3, "CASO D: as três referências deveriam ser candidatas (nenhum sinal negativo aqui)");
  const logotipo = occurrences.find((o) => o.text === "logotipo.png");
  const html = imagePending.toggleImageOccurrenceRejection(statement, logotipo);
  occurrences = imagePending.findCandidateImageOccurrences(html);
  assert.equal(occurrences.length, 3);
  const rejectedOnes = occurrences.filter((o) => o.rejected);
  const keptOnes = occurrences.filter((o) => !o.rejected);
  assert.equal(rejectedOnes.length, 1, "CASO D: só logotipo.png deveria estar rejeitada");
  assert.equal(rejectedOnes[0].text, "logotipo.png");
  assert.equal(keptOnes.length, 2, "CASO D: imagem1.png e imagem2.jpg continuam válidas");
  assert.deepEqual(keptOnes.map((o) => o.text).sort(), ["imagem1.png", "imagem2.jpg"]);
  // Rejeitar uma única referência entre várias não zera o estado de imagem pendente da questão.
  assert.equal(imagePending.isQuestionImagePending({ statement: html }), true, "CASO O: ainda restam imagens válidas -> estado azul deve continuar");
}

// CASO F — desfazer: alternar de novo volta a ser tratada como imagem.
{
  const statement = "Anexo: logotipo.png";
  const occurrence = imagePending.findCandidateImageOccurrences(statement)[0];
  const rejectedHtml = imagePending.toggleImageOccurrenceRejection(statement, occurrence);
  const rejectedOccurrence = imagePending.findCandidateImageOccurrences(rejectedHtml)[0];
  assert.equal(rejectedOccurrence.rejected, true);
  const restoredHtml = imagePending.toggleImageOccurrenceRejection(rejectedHtml, rejectedOccurrence);
  assert.equal(restoredHtml, statement, "Desfazer deveria restaurar o HTML original, sem span residual");
  const restoredOccurrence = imagePending.findCandidateImageOccurrences(restoredHtml)[0];
  assert.equal(restoredOccurrence.rejected, false);
  assert.equal(imagePending.isQuestionImagePending({ statement: restoredHtml }), true, "CASO F: desfeita a rejeição, volta a contar como imagem pendente");
}

// CASO G — persistência: a rejeição sobrevive a uma nova leitura do mesmo HTML (sem depender de state em memória).
{
  const statement = "Considere o arquivo modelo.docx e a imagem grafico.png.";
  const occurrence = imagePending.findCandidateImageOccurrences(statement).find((o) => o.text === "grafico.png");
  assert.ok(occurrence);
  const persistedHtml = imagePending.toggleImageOccurrenceRejection(statement, occurrence);
  // Simula "salvar e reabrir": nenhuma referência a estado do React, só o HTML persistido de volta.
  const reloaded = imagePending.findCandidateImageOccurrences(persistedHtml);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].rejected, true, "CASO G: a rejeição deve sobreviver a uma releitura do mesmo HTML persistido");
}

// Regressão: imagem já inserida reduz a contagem de pendências corretamente (múltiplas imagens).
{
  const statement = "Observe a imagem figura01.png e a imagem figura02.jpg a seguir.";
  assert.equal(imagePending.isQuestionImagePending({ statement }), true, "duas referências sem nenhuma imagem inserida -> pendente");
  assert.equal(imagePending.isQuestionImagePending({ statement, images: [{}] }), true, "uma de duas inseridas -> ainda pendente");
  assert.equal(imagePending.isQuestionImagePending({ statement, images: [{}, {}] }), false, "as duas inseridas -> não pendente");
}

// Regressão: frase-marcador explícita continua funcionando e não é afetada pela heurística/rejeição de arquivo.
{
  const statement = "Existe uma imagem associada para resolução da questão.";
  assert.equal(imagePending.isQuestionImagePending({ statement }), true);
  assert.equal(imagePending.isQuestionImagePending({ statement, image_url: "https://cdn.example.com/a.png" }), false);
}

// Regressão: alternativas continuam entrando na contagem, cada uma podendo ter sua própria rejeição.
{
  const question = {
    statement: "Marque a alternativa correta.",
    alternatives: [
      { text: "Consulte o arquivo planilha.xlsx e a imagem grafico1.png." },
      { text: "Sem nenhuma referência de imagem aqui." },
    ],
  };
  assert.equal(imagePending.isQuestionImagePending(question), true);
  const occurrence = imagePending.findCandidateImageOccurrences(question.alternatives[0].text)[0];
  const rejectedAltText = imagePending.toggleImageOccurrenceRejection(question.alternatives[0].text, occurrence);
  const afterReject = { ...question, alternatives: [{ text: rejectedAltText }, question.alternatives[1]] };
  assert.equal(imagePending.isQuestionImagePending(afterReject), false, "rejeitar a única referência de uma alternativa remove a pendência dela");
}

// has_pending_image/image_pending explícitos continuam tendo prioridade absoluta (compatibilidade).
{
  assert.equal(imagePending.isQuestionImagePending({ statement: "sem nada", has_pending_image: true }), true);
  assert.equal(imagePending.isQuestionImagePending({ statement: "sem nada", image_pending: true }), true);
}

console.log("Image detector unit tests: PASS");


// Exercita os helpers reais do editor no DOM, sem servidor ou banco.
async function verifyEditorRoundTrip() {
  const { chromium } = require('@playwright/test');
  const read = (file) => fs.readFileSync(file, 'utf8');
  function functionsFrom(file, names) {
    const source = read(file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
    assert.equal(functions.length, names.length, file + ': helpers reais devem existir');
    return ts.transpileModule(functions.map((node) => node.getText(ast)).join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
  }
  const richJs = functionsFrom('app/components/questions/RichTextEditor.tsx', [
    'collectTextNodeMarkers', 'highlightImageMarkersInHtml', 'normalizeRichTextValue', 'sanitizeHtml',
  ]);
  const cleanJs = functionsFrom('app/api/admin/questions/[id]/route.ts', ['clean']);
  const detectorJs = ts.transpileModule(read('lib/questions/image-pending.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const editor = read('app/components/questions/QuestionEditor.tsx');
  assert.match(editor, /onAutoPrepareForQueue\?\.\(\)/);
  assert.doesNotMatch(editor, /onAutoSelect/);
  assert.match(editor, /findCandidateImageOccurrences/);
  assert.match(editor, /statement: question.statement/);
  assert.match(editor, /explanation_text: question.explanation_text/);
  assert.match(editor, /review_comment: question.review_comment/);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(({ richJs, cleanJs, detectorJs }) => {
      const exports = {};
      new Function('exports', detectorJs)(exports);
      const rich = new Function('findCandidateImageOccurrences', 'IMAGE_REQUIRED_PHRASE_REGEX',
        richJs + ';return {sanitizeHtml, normalizeRichTextValue};')(
          exports.findCandidateImageOccurrences, exports.IMAGE_REQUIRED_PHRASE_REGEX);
      const clean = new Function(cleanJs + ';return clean;')();
      const rows = [];
      for (const field of ['statement', 'explanation_text', 'review_comment', 'text']) {
        const original = '<p>Anexo: logotipo.png</p>';
        const occurrence = exports.findCandidateImageOccurrences(original)[0];
        const rejected = exports.toggleImageOccurrenceRejection(original, occurrence);
        const sanitized = rich.sanitizeHtml(rejected);
        // Transporte JSON e coluna HTML em memoria: nao substitui teste de banco.
        const payload = JSON.parse(JSON.stringify({ [field]: sanitized }));
        const stored = clean(payload[field]);
        const reloaded = rich.normalizeRichTextValue(JSON.parse(JSON.stringify(stored)));
        const root = document.createElement('div');
        root.innerHTML = reloaded;
        const occurrences = exports.findCandidateImageOccurrences(reloaded);
        const restored = exports.toggleImageOccurrenceRejection(reloaded, occurrences[0]);
        rows.push({ field,
          rejected: root.querySelectorAll('[data-image-ref="rejected"]').length,
          highlights: root.querySelectorAll('[data-image-ref="rejected"] [data-image-marker]').length,
          pending: exports.isQuestionImagePending({ statement: reloaded }),
          rejectedAfterReload: occurrences[0]?.rejected,
          restored: restored === original,
          pendingAfterRestore: exports.isQuestionImagePending({ statement: restored }),
        });
      }
      return rows;
    }, { richJs, cleanJs, detectorJs });
    for (const row of result) {
      assert.equal(row.rejected, 1, row.field);
      assert.equal(row.highlights, 0, row.field);
      assert.equal(row.pending, false, row.field);
      assert.equal(row.rejectedAfterReload, true, row.field);
      assert.equal(row.restored, true, row.field);
      assert.equal(row.pendingAfterRestore, true, row.field);
    }
    console.log('Editor DOM / HTML round-trip (sem banco): PASS');
  } finally {
    await browser.close();
  }
}
verifyEditorRoundTrip().catch((error) => { console.error(error); process.exitCode = 1; });
