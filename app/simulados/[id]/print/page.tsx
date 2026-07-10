/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdminPage } from "@/lib/server/authGuard";
import PrintToolbar from "./PrintToolbar";
import PrintSlideScaler from "./PrintSlideScaler";
import PrintSlideFrame from "./PrintSlideFrame";

async function getPrintData(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("simulados")
    .select(`
      id,
      title,
      description,
      simulado_questions (
        id,
        order_number,
        points,
        status,
        questions:question_id (
          id,
          statement,
          image_url,
          question_type,
          subjects:subject_id (name),
          question_alternatives (
            id,
            label,
            text,
            image_url,
            order_number
          )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

function cleanRichHtml(value?: string | null) {
  return String(value || "")
    .replace(/<mark([^>]*)>/gi, "<mark$1>")
    .replace(/\sclass=("[^"]*"|'[^']*')/gi, "")
    .replace(/\sstyle=("[^"]*"|'[^']*')/gi, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br />");
}

function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type SlideQuestionSize = "small" | "medium" | "large";

function getSlideQuestionSize(relation: any): SlideQuestionSize {
  const question = relation?.questions;
  const statementText = stripHtml(question?.statement);
  const alternatives = question?.question_alternatives || [];
  const alternativesText = alternatives.map((alternative: any) => stripHtml(alternative?.text));
  const alternativesLength = alternativesText.reduce((total: number, text: string) => total + text.length, 0);
  const longestAlternative = alternativesText.reduce((longest: number, text: string) => Math.max(longest, text.length), 0);
  const explicitBreaks = (String(question?.statement || "").match(/\n|<br\s*\/?\s*>|<\/p>|<\/li>/gi) || []).length;
  const romanItems = (statementText.match(/(?:^|\s)(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.):-]/g) || []).length;
  const totalLength = statementText.length + alternativesLength;

  // Questões grandes precisam nascer mais horizontais para exigir menos redução no PowerPoint.
  if (
    statementText.length >= 700 ||
    totalLength >= 1050 ||
    explicitBreaks >= 6 ||
    romanItems >= 3 ||
    longestAlternative >= 250
  ) {
    return "large";
  }

  // Questões pequenas recebem tipografia e respiro maiores para ocupar melhor a área útil do slide.
  if (
    statementText.length <= 280 &&
    totalLength <= 620 &&
    explicitBreaks <= 3 &&
    longestAlternative <= 150
  ) {
    return "small";
  }

  return "medium";
}

function formatPoints(value: unknown) {
  const points = Number(value ?? 1);
  const safePoints = Number.isFinite(points) ? points : 1;
  return `${safePoints.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
}

function QuestionContent({ relation, index, total, mode }: { relation: any; index: number; total: number; mode: "slide" | "continuous" }) {
  const question = relation.questions;
  const alternatives = [...(question.question_alternatives || [])].sort(
    (a: any, b: any) => Number(a.order_number || 0) - Number(b.order_number || 0),
  );
  const isTrueFalse = question.question_type === "true_false";
  const slideSize = mode === "slide" ? getSlideQuestionSize(relation) : "medium";
  const slideLayout = {
    small: {
      article: "px-8 py-6 sm:px-10 sm:py-8 lg:px-12 lg:py-10",
      meta: "mb-8 text-[20px]",
      minFontSize: 26,
      maxFontSize: 42,
      questionLineHeight: 1.34,
      list: "mt-[0.9em] space-y-[0.65em]",
      alternative: "gap-[0.55em]",
    },
    medium: {
      article: "px-8 py-6 sm:px-10 sm:py-8 lg:px-12 lg:py-10",
      meta: "mb-7 text-[18px]",
      minFontSize: 24,
      maxFontSize: 60,
      questionLineHeight: 1.38,
      list: "mt-[0.85em] space-y-[0.55em]",
      alternative: "gap-[0.5em]",
    },
    large: {
      article: "px-7 py-6 sm:px-9 sm:py-7 lg:px-11 lg:py-8",
      meta: "mb-4 text-[16px]",
      minFontSize: 20,
      maxFontSize: 30,
      questionLineHeight: 1.35,
      list: "mt-[0.6em] space-y-[0.4em]",
      alternative: "gap-[0.4em]",
    },
  }[slideSize];

  const statementNode = (
    <div
      className={
        mode === "slide"
          ? "print-richtext text-slate-950"
          : "print-richtext text-[15px] leading-7 text-slate-950 print:text-[12pt] print:leading-[1.45]"
      }
      dangerouslySetInnerHTML={{ __html: cleanRichHtml(question.statement) }}
    />
  );

  const imageNode = question.image_url ? (
    <img
      src={question.image_url}
      alt={`Imagem da questão ${index + 1}`}
      className={mode === "slide" ? "mt-5 max-h-[32vh] max-w-full self-start object-contain" : "mt-3 max-h-[360px] max-w-full object-contain print:max-h-[250mm]"}
    />
  ) : null;

  const alternativesNode = alternatives.length ? (
    <ol className={mode === "slide" ? slideLayout.list : "mt-4 space-y-2 print:mt-3 print:space-y-1.5"}>
      {alternatives.map((alternative: any, altIndex: number) => {
        const label = isTrueFalse
          ? String(alternative.text || alternative.label || "").trim() || (altIndex === 0 ? "Certo" : "Errado")
          : alternative.label || String.fromCharCode(65 + altIndex);
        return (
          <li
            key={alternative.id || `${index}-${altIndex}`}
            className={
              mode === "slide"
                ? `flex items-start text-slate-950 ${slideLayout.alternative}`
                : "flex items-start gap-3 text-[14px] leading-6 text-slate-900 print:text-[11.5pt] print:leading-[1.4]"
            }
          >
            <span className="shrink-0 font-bold">{isTrueFalse ? `${label}.` : `${label})`}</span>
            {!isTrueFalse ? (
              <div
                className="print-richtext min-w-0 flex-1"
                dangerouslySetInnerHTML={{ __html: cleanRichHtml(alternative.text) }}
              />
            ) : null}
            {alternative.image_url ? (
              <img
                src={alternative.image_url}
                alt={`Imagem da alternativa ${label}`}
                className={mode === "slide" ? "mt-1 max-h-52 max-w-full object-contain" : "mt-1 max-h-52 max-w-full object-contain print:max-h-36"}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  ) : null;

  return (
    <article
      data-question-size={slideSize}
      className={
        mode === "slide"
          ? `slide-question flex h-full max-h-full w-full flex-col overflow-y-auto bg-white text-slate-950 ${slideLayout.article}`
          : "break-inside-avoid-page border-b border-slate-300 pb-6 print:pb-4"
      }
      style={mode === "slide" ? { fontFamily: 'Aptos, "Aptos Display", Arial, Helvetica, sans-serif' } : undefined}
    >
      <div className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 font-bold ${mode === "slide" ? slideLayout.meta : "mb-4 text-xs print:mb-2.5"}`}>
        <span className="text-slate-950">Questão {index + 1} de {total}</span>
        <span className="text-slate-400">•</span>
        <span className="text-slate-600">{question.subjects?.name || "Sem assunto"}</span>
        <span className="text-slate-400">•</span>
        <span className="text-slate-600">{formatPoints(relation.points)}</span>
        {relation.status === "annulled" ? (
          <>
            <span className="text-slate-400">•</span>
            <span className="uppercase text-slate-700">Anulada</span>
          </>
        ) : null}
      </div>

      {mode === "slide" ? (
        <PrintSlideScaler
          minFontSize={slideLayout.minFontSize}
          maxFontSize={slideLayout.maxFontSize}
          lineHeight={slideLayout.questionLineHeight}
        >
          {statementNode}
          {imageNode}
          {alternativesNode}
        </PrintSlideScaler>
      ) : (
        <>
          {statementNode}
          {imageNode}
          {alternativesNode}
        </>
      )}
    </article>
  );
}

export default async function SimuladoPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; question?: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const query = await searchParams;
  const simulado = await getPrintData(id);
  if (!simulado) notFound();

  const questions = [...((simulado as any).simulado_questions || [])]
    .filter((relation: any) => relation?.questions)
    .sort((a: any, b: any) => Number(a.order_number || 0) - Number(b.order_number || 0));

  const mode: "slide" | "continuous" = query.mode === "continuous" ? "continuous" : "slide";
  const requestedQuestion = Number.parseInt(String(query.question || "1"), 10);
  const currentQuestion = Math.min(Math.max(Number.isFinite(requestedQuestion) ? requestedQuestion : 1, 1), Math.max(questions.length, 1));
  const visibleQuestions = mode === "slide" ? questions.slice(currentQuestion - 1, currentQuestion) : questions;

  return (
    <main className={`bg-white text-slate-950 print:min-h-0 ${mode === "slide" ? "slide-mode flex h-screen flex-col overflow-hidden" : "continuous-mode min-h-screen"}`}>
      <PrintToolbar simuladoId={id} mode={mode} currentQuestion={currentQuestion} totalQuestions={questions.length} />

      {mode === "continuous" ? (
        <div className="mx-auto max-w-[1100px] px-8 py-10 print:max-w-none print:px-0 print:py-0">
          <header className="mb-8 border-b border-slate-300 pb-5 print:mb-5 print:pb-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">EstudoTOP Simulados</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 print:text-xl">{simulado.title}</h1>
            {simulado.description ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{simulado.description}</p> : null}
            <p className="mt-3 text-xs font-semibold text-slate-500">{questions.length} questão(ões)</p>
          </header>

          <section className="space-y-7 print:space-y-5">
            {visibleQuestions.map((relation: any, index: number) => (
              <QuestionContent key={relation.id || relation.questions?.id || index} relation={relation} index={index} total={questions.length} mode="continuous" />
            ))}
          </section>
        </div>
      ) : (
        <div className="slide-stage flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white px-4 py-4 sm:px-6 sm:py-5">
          <PrintSlideFrame>
            {visibleQuestions.map((relation: any) => (
              <QuestionContent
                key={relation.id || relation.questions?.id || currentQuestion}
                relation={relation}
                index={currentQuestion - 1}
                total={questions.length}
                mode="slide"
              />
            ))}
          </PrintSlideFrame>
        </div>
      )}

      <style>{`
        .print-richtext p { margin: 0 0 0.42rem; }
        .print-richtext p:last-child { margin-bottom: 0; }
        .print-richtext ul, .print-richtext ol { margin: 0.42rem 0 0.42rem 1.25rem; }
        .print-richtext ul { list-style: disc; }
        .print-richtext ol { list-style: decimal; }
        .print-richtext img { max-width: 100%; height: auto; }
        .print-richtext mark { background: transparent; color: inherit; }
        .slide-mode { height: 100vh; overflow: hidden; }
        .slide-stage { min-height: 0; }
        .slide-question { min-height: 0; }
        .slide-mode .print-richtext,
        .slide-mode .print-richtext *,
        .slide-mode li,
        .slide-mode li * {
          font-family: Aptos, "Aptos Display", Arial, Helvetica, sans-serif !important;
          font-size: inherit !important;
          line-height: inherit !important;
          color: inherit !important;
          opacity: 1 !important;
        }
        .slide-mode .print-richtext * {
          background: transparent !important;
        }
        .slide-mode .print-richtext span,
        .slide-mode .print-richtext strong,
        .slide-mode .print-richtext em {
          font-size: inherit !important;
          line-height: inherit !important;
        }
        @media (max-width: 900px) {
          .slide-question { height: 100%; min-height: 100%; }
        }
        @media print {
          @page { size: A4; margin: 14mm 15mm; }
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: economy; print-color-adjust: economy; }
          a { color: inherit; text-decoration: none; }
          .slide-mode .slide-question { height: auto; min-height: 0; overflow: visible; padding: 0; }
        }
      `}</style>
    </main>
  );
}
