"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ImageIcon,
  Library,
  MessageSquareText,
  MonitorPlay,
  ScanLine,
  Smartphone,
  X,
} from "lucide-react";
import StudentExplanationAuthorCard from "../../../components/questions/StudentExplanationAuthorCard";
import { extractQuestionSubjects, formatQuestionSubjects } from "@/lib/questions/question-subjects";
import { isQuestionImagePending } from "@/lib/questions/image-pending";
import {
  getStudentAlternatives,
  getStudentCorrectAlternative,
} from "@/lib/questions/true-false-alternatives";

const OWL_MARK = "\u{1F989}️";
const BRAND_LOGO_SRC = "/images/Logo 04 -transp.png";

export const VERTICAL_CANVAS = { width: 1080, height: 1920 } as const;
// Zona de leitura dentro da composição 1080 × 1920. O topo termina 24 px abaixo
// da logomarca (56 + 150 px); laterais e base usam a mesma margem de 96 px,
// formando uma moldura simétrica e deixando o restante da altura para a questão.
export const VERTICAL_LOGO = { top: 56, height: 150 } as const;
export const VERTICAL_SAFE_AREA = { top: 230, bottom: 96, left: 96, right: 96 } as const;

export type PresentationMode = "normal" | "vertical";

export function computeVerticalScale(availableWidth: number, availableHeight: number) {
  if (availableWidth <= 0 || availableHeight <= 0) return 0;
  return Math.min(1, availableWidth / VERTICAL_CANVAS.width, availableHeight / VERTICAL_CANVAS.height);
}

type Alternative = {
  id?: string;
  label: string;
  text: string;
  image_url?: string | null;
  is_correct?: boolean;
  order_number?: number;
};

type Question = {
  id: string;
  code?: string | null;
  statement: string;
  status?: string | null;
  question_type?: string | null;
  difficulty_level?: number | null;
  year?: number | null;
  orgao?: string | null;
  image_url?: string | null;
  explanation_text?: string | null;
  created_at?: string | null;
  discipline?: { id: string; name: string } | null;
  subjects?: {
    id: string;
    name: string;
    disciplines?: {
      id: string;
      name: string;
    } | null;
  } | null;
  question_subjects?: {
    subjects?: {
      id: string;
      name: string;
      discipline_id?: string | null;
      disciplines?: {
        id: string;
        name: string;
      } | null;
    } | null;
  }[];
  exam_boards?: {
    id: string;
    name: string;
  } | null;
  question_alternatives: Alternative[];
};

// Estilos inline herdados do editor escuro (cor, fonte, tamanho) são
// neutralizados para manter contraste e tipografia uniformes; destaques,
// negrito, itálico, listas, tabelas e imagens são preservados.
const RICH_CONTENT_CLASS =
  "richtext-editor min-w-0 max-w-full overflow-x-auto break-words [&_*]:text-inherit! [&_*]:[font-family:inherit]! [&_*]:[font-size:inherit]! [&_*]:[line-height:inherit]! [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-default [&_p+p]:mt-[0.5em] [&_ol]:list-decimal [&_ol]:pl-[1.5em] [&_ul]:list-disc [&_ul]:pl-[1.5em] [&_table]:my-[0.6em] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-[0.6em] [&_td]:py-[0.3em] [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-[0.6em] [&_th]:py-[0.3em] [&_th]:font-bold";

const VARIANT_STYLES = {
  normal: {
    image: "max-h-[520px]",
    statement: "text-xl leading-[1.7] md:text-[22px] xl:text-2xl",
    altList: "mt-10 space-y-4",
    altCard: "rounded-3xl border-2 p-5 md:p-6",
    altRow: "gap-5",
    altText: "text-lg leading-[1.6] md:text-xl",
    altImage: "max-h-[320px]",
    badge: "h-12 w-12 rounded-2xl text-lg",
    tfDot: "h-8 w-8 text-base",
    answerBox: "mt-8 rounded-3xl border-2 p-6 text-lg",
    commentBox: "mt-6 rounded-3xl border-2 p-6",
    commentTitle: "text-base",
    commentText: "text-base leading-[1.7] md:text-lg",
    source: "mb-5 gap-x-3 gap-y-1 border-l-4 pl-4 text-sm md:text-base",
    sourceLabel: "text-[11px] md:text-xs",
  },
  // Medidas variáveis vêm das propriedades --vt-* definidas por VerticalFitScroll.
  vertical: {
    image: "max-h-[640px]",
    statement: "text-[length:var(--vt-statement)] leading-[1.5]",
    altList: "mt-[var(--vt-block-gap)] space-y-[var(--vt-alt-gap)]",
    altCard: "rounded-[36px] border-[3px] p-[var(--vt-card-pad)]",
    altRow: "gap-7",
    altText: "text-[length:var(--vt-alt)] leading-[1.45]",
    altImage: "max-h-[420px]",
    badge: "h-[76px] w-[76px] rounded-[26px] text-[32px]",
    tfDot: "h-[56px] w-[56px] text-[28px]",
    answerBox: "mt-[var(--vt-answer-gap)] rounded-[36px] border-[3px] p-[var(--vt-card-pad)] text-[length:var(--vt-answer)]",
    commentBox: "mt-[var(--vt-comment-gap)] rounded-[36px] border-[3px] p-[var(--vt-card-pad)]",
    commentTitle: "text-[28px]",
    commentText: "text-[length:var(--vt-comment)] leading-[1.5]",
    source: "mb-[var(--vt-source-gap)] gap-x-4 gap-y-1 border-l-[6px] pl-6 text-[length:var(--vt-source)]",
    sourceLabel: "text-[20px]",
  },
} as const;

// Limites da composição nativa 1080 × 1920 (antes da escala de exibição).
export const VERTICAL_FONT_LIMITS = {
  statement: { max: 38, min: 30 },
  alternative: { max: 34, min: 28 },
  source: { max: 26, min: 24 },
} as const;

type VerticalFitLevel = {
  statement: number;
  alternative: number;
  source: number;
  answer: number;
  comment: number;
  spacing: number;
};

// Níveis em ordem de preferência: o nível 0 é o layout original; os seguintes
// reduzem primeiro os espaçamentos e depois as fontes, 1 px de enunciado por
// vez, mantendo a proporção entre enunciado, alternativas e fonte.
export const VERTICAL_FIT_LEVELS: VerticalFitLevel[] = (() => {
  const levels: VerticalFitLevel[] = [];
  const { statement, alternative, source } = VERTICAL_FONT_LIMITS;
  const typography = (statementSize: number) => {
    const progress = (statement.max - statementSize) / (statement.max - statement.min);
    const alternativeSize = Math.round(alternative.max - progress * (alternative.max - alternative.min));
    return {
      statement: statementSize,
      alternative: alternativeSize,
      source: Math.round(source.max - progress * (source.max - source.min)),
      answer: Math.round((32 * alternativeSize) / alternative.max),
      comment: Math.round((30 * alternativeSize) / alternative.max),
    };
  };
  for (const spacing of [1, 0.85, 0.7, 0.55]) levels.push({ ...typography(statement.max), spacing });
  for (let size = statement.max - 1; size >= statement.min; size -= 1) levels.push({ ...typography(size), spacing: 0.55 });
  return levels;
})();

export function verticalFitVariables(level: VerticalFitLevel): Record<string, string> {
  const px = (value: number) => `${Math.round(value)}px`;
  return {
    "--vt-statement": px(level.statement),
    "--vt-alt": px(level.alternative),
    "--vt-source": px(level.source),
    "--vt-answer": px(level.answer),
    "--vt-comment": px(level.comment),
    "--vt-block-gap": px(48 * level.spacing),
    "--vt-alt-gap": px(24 * level.spacing),
    "--vt-card-pad": px(32 * level.spacing),
    "--vt-source-gap": px(28 * level.spacing),
    "--vt-answer-gap": px(40 * level.spacing),
    "--vt-comment-gap": px(32 * level.spacing),
  };
}

function applyVerticalFitLevel(element: HTMLElement, level: VerticalFitLevel) {
  for (const [name, value] of Object.entries(verticalFitVariables(level))) element.style.setProperty(name, value);
}

function toPresentationHtml(value?: string | null) {
  if (!value) return { __html: "" };

  let output = value;

  if (output.includes("&lt;") || output.includes("&gt;") || output.includes("&amp;")) {
    output = output
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  output = output.replace(/<mark([^>]*)>/gi, '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">');

  if (!/<(p|div|br|h[1-6]|ul|ol|li|blockquote|table)\b/i.test(output)) {
    output = output.replace(/\n/g, "<br>");
  }

  return { __html: output };
}

function isErradoAlternative(alternative?: Alternative | null) {
  if (!alternative) return false;
  return alternative.label === "E" || String(alternative.text || "").trim().toLowerCase() === "errado";
}

type PresentationData = {
  code: string;
  disciplineName: string;
  subjectName: string;
  boardName: string;
  sourceParts: string[];
  isTrueFalse: boolean;
  alternatives: Alternative[];
  correctAlternative: Alternative | null;
};

function buildPresentationData(question: Question): PresentationData {
  const linkedSubjects = extractQuestionSubjects(question);
  const disciplineName =
    question.discipline?.name ||
    Array.from(new Set(linkedSubjects.map((subject) => subject?.disciplines?.name).filter(Boolean))).join(", ");

  const boardName = question.exam_boards?.name?.trim() || "";
  // O Concurso é registrado no campo `orgao` da questão (rotulado "Órgão" no
  // editor); não há coluna de cargo.
  const contestName = question.orgao?.trim() || "";
  const year = Number.isInteger(question.year) ? String(question.year) : "";

  return {
    code: question.code || "ET0000",
    disciplineName,
    subjectName: formatQuestionSubjects(question),
    boardName,
    sourceParts: [boardName, contestName, year].filter(Boolean),
    isTrueFalse: question.question_type === "true_false",
    alternatives: getStudentAlternatives(question.question_type, question.question_alternatives),
    correctAlternative: getStudentCorrectAlternative(question.question_type, question.question_alternatives) || null,
  };
}

export default function PreviewQuestaoClient({ question }: { question: Question }) {
  const [mode, setMode] = useState<PresentationMode>("normal");
  const [showAnswer, setShowAnswer] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);

  const data = buildPresentationData(question);
  const hasComment = Boolean(question.explanation_text?.trim());
  const imagePending = isQuestionImagePending(question);

  const body = (variant: PresentationMode) => (
    <QuestionBody
      question={question}
      data={data}
      variant={variant}
      showAnswer={showAnswer}
      showComment={showComment && hasComment}
      showSource={showSource}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-900 text-slate-950" data-presentation-mode={mode}>
      <PresentationToolbar
        code={data.code}
        mode={mode}
        onModeChange={setMode}
        showAnswer={showAnswer}
        onToggleAnswer={() => setShowAnswer((current) => !current)}
        hasComment={hasComment}
        showComment={showComment}
        onToggleComment={() => setShowComment((current) => !current)}
        showSource={showSource}
        onToggleSource={() => setShowSource((current) => !current)}
        showSafeArea={showSafeArea}
        onToggleSafeArea={() => setShowSafeArea((current) => !current)}
        imagePending={imagePending}
      />

      <div className="min-h-0 flex-1">
        {mode === "normal" ? (
          <div className="h-full overflow-y-auto bg-[#f5f7fb]" data-presentation-scroll="normal">
            <article
              data-presentation-composition="normal"
              className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14"
            >
              <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BRAND_LOGO_SRC} alt="EstudoTOP Simulados" className="h-14 w-auto md:h-16" />
                <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black tracking-wide text-white">
                  Questão {data.code}
                </span>
              </header>

              <MetaChips data={data} size="normal" />

              <div className="mt-8">{body("normal")}</div>
            </article>
          </div>
        ) : (
          <VerticalStage showSafeArea={showSafeArea}>
            <div
              data-presentation-composition="vertical"
              className="relative h-full w-full bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_55%,#f1f5f9_100%)]"
            >
              <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-r from-orange-500 to-amber-400" />

              <div className="absolute inset-x-0 top-[56px] flex h-[150px] justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BRAND_LOGO_SRC} alt="EstudoTOP Simulados" className="h-[150px] w-auto" />
              </div>

              <div
                data-presentation-safe-content
                className="absolute bottom-[96px] left-[96px] right-[96px] top-[230px] flex flex-col"
              >
                <MetaChips data={data} size="vertical" />

                <VerticalFitScroll fitKey={`${showSource}|${showAnswer}|${showComment && hasComment}`}>
                  {body("vertical")}
                </VerticalFitScroll>
              </div>
            </div>
          </VerticalStage>
        )}
      </div>
    </div>
  );
}

function PresentationToolbar({
  code,
  mode,
  onModeChange,
  showAnswer,
  onToggleAnswer,
  hasComment,
  showComment,
  onToggleComment,
  showSource,
  onToggleSource,
  showSafeArea,
  onToggleSafeArea,
  imagePending,
}: {
  code: string;
  mode: PresentationMode;
  onModeChange: (mode: PresentationMode) => void;
  showAnswer: boolean;
  onToggleAnswer: () => void;
  hasComment: boolean;
  showComment: boolean;
  onToggleComment: () => void;
  showSource: boolean;
  onToggleSource: () => void;
  showSafeArea: boolean;
  onToggleSafeArea: () => void;
  imagePending: boolean;
}) {
  const normalRef = useRef<HTMLButtonElement>(null);
  const verticalRef = useRef<HTMLButtonElement>(null);

  function handleModeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const next: Partial<Record<string, PresentationMode>> = {
      ArrowLeft: "normal",
      ArrowUp: "normal",
      Home: "normal",
      ArrowRight: "vertical",
      ArrowDown: "vertical",
      End: "vertical",
    };
    const target = next[event.key];
    if (!target) return;
    event.preventDefault();
    onModeChange(target);
    (target === "normal" ? normalRef : verticalRef).current?.focus();
  }

  const segmentClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
      active ? "bg-orange-500 text-white shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
    }`;

  const toggleClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
      active
        ? "border-orange-400/60 bg-orange-500/15 text-orange-200"
        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white"
    }`;

  return (
    <div
      role="toolbar"
      aria-label="Controles da apresentação"
      data-presentation-toolbar
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-slate-950 px-4 py-2.5 text-slate-200"
    >
      <p className="mr-auto text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        Modo apresentação <span className="text-slate-200">· Questão {code}</span>
      </p>

      <div
        role="radiogroup"
        aria-label="Formato da apresentação"
        onKeyDown={handleModeKeyDown}
        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1"
      >
        <button
          ref={normalRef}
          type="button"
          role="radio"
          aria-checked={mode === "normal"}
          tabIndex={mode === "normal" ? 0 : -1}
          onClick={() => onModeChange("normal")}
          className={segmentClass(mode === "normal")}
        >
          <MonitorPlay size={14} />
          Normal
        </button>
        <button
          ref={verticalRef}
          type="button"
          role="radio"
          aria-checked={mode === "vertical"}
          tabIndex={mode === "vertical" ? 0 : -1}
          onClick={() => onModeChange("vertical")}
          className={segmentClass(mode === "vertical")}
        >
          <Smartphone size={14} />
          Vertical
        </button>
      </div>

      <button type="button" aria-pressed={showAnswer} onClick={onToggleAnswer} className={toggleClass(showAnswer)}>
        {showAnswer ? <EyeOff size={14} /> : <Eye size={14} />}
        {showAnswer ? "Ocultar gabarito" : "Mostrar gabarito"}
      </button>

      {hasComment && (
        <button type="button" aria-pressed={showComment} onClick={onToggleComment} className={toggleClass(showComment)}>
          <MessageSquareText size={14} />
          {showComment ? "Ocultar comentário" : "Mostrar comentário"}
        </button>
      )}

      <button type="button" aria-pressed={showSource} onClick={onToggleSource} className={toggleClass(showSource)}>
        <Library size={14} />
        {showSource ? "Ocultar fonte" : "Mostrar fonte"}
      </button>

      {mode === "vertical" && (
        <button type="button" aria-pressed={showSafeArea} onClick={onToggleSafeArea} className={toggleClass(showSafeArea)}>
          <ScanLine size={14} />
          Área segura
        </button>
      )}

      {imagePending && (
        <span className="inline-flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
          <ImageIcon size={14} />
          Imagem pendente
        </span>
      )}

      <button
        type="button"
        onClick={() => window.close()}
        aria-label="Fechar apresentação"
        title="Fechar apresentação"
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function VerticalStage({ children, showSafeArea }: { children: ReactNode; showSafeArea: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function fit() {
      const styles = window.getComputedStyle(stage!);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      setScale(computeVerticalScale(stage!.clientWidth - paddingX, stage!.clientHeight - paddingY));
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const appliedScale = scale ?? 0;

  return (
    <div ref={stageRef} className="flex h-full items-center justify-center overflow-hidden p-4 md:p-6">
      {/* Dimensões calculadas em tempo de execução: a moldura recebe o tamanho
          escalado e a composição interna mantém 1080 × 1920 lógicos. */}
      <div
        data-presentation-frame
        className={`relative shrink-0 overflow-hidden bg-white ${scale === null ? "invisible" : ""}`}
        style={{ width: VERTICAL_CANVAS.width * appliedScale, height: VERTICAL_CANVAS.height * appliedScale }}
      >
        <div
          data-presentation-canvas
          className="absolute left-0 top-0 h-[1920px] w-[1080px] origin-top-left"
          style={{ transform: `scale(${appliedScale})` }}
        >
          {children}

          {showSafeArea && (
            <div aria-hidden="true" data-presentation-safe-guide className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 flex h-[230px] items-end justify-center bg-red-500/10 pb-2 text-[22px] font-bold text-red-700">
                Topo: identificação EstudoTOP
              </div>
              <div className="absolute inset-x-0 bottom-0 flex h-[96px] items-center justify-center bg-red-500/10 text-[22px] font-bold text-red-700">
                Base: margem de acabamento
              </div>
              <div className="absolute bottom-[96px] left-[96px] right-[96px] top-[230px] border-[3px] border-dashed border-emerald-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Escolhe o primeiro nível em que o conteúdo renderizado cabe na área de
// leitura. scrollHeight/clientHeight são medidas de layout na composição nativa
// e não sofrem efeito do transform de escala da moldura. Recalcula somente em
// gatilhos discretos (montagem, troca de fonte/gabarito/comentário, imagens e
// fontes carregadas) e sempre a partir do nível 0, sem observar o próprio
// tamanho: o resultado é determinístico e não oscila.
function VerticalFitScroll({ children, fitKey }: { children: ReactNode; fitKey: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    let frame = 0;
    let active = true;

    function fit() {
      let chosen = VERTICAL_FIT_LEVELS.length - 1;
      for (let index = 0; index < VERTICAL_FIT_LEVELS.length; index += 1) {
        applyVerticalFitLevel(element!, VERTICAL_FIT_LEVELS[index]);
        if (element!.scrollHeight <= element!.clientHeight) {
          chosen = index;
          break;
        }
      }
      applyVerticalFitLevel(element!, VERTICAL_FIT_LEVELS[chosen]);
      element!.dataset.fitLevel = String(chosen);
      element!.dataset.fitOverflow = String(element!.scrollHeight > element!.clientHeight);
    }

    function scheduleFit() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (active) fit();
      });
    }

    fit();
    element.addEventListener("load", scheduleFit, true);
    element.addEventListener("error", scheduleFit, true);
    void document.fonts?.ready.then(scheduleFit);

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      element.removeEventListener("load", scheduleFit, true);
      element.removeEventListener("error", scheduleFit, true);
    };
  }, [fitKey]);

  return (
    <div
      ref={scrollRef}
      data-presentation-scroll="vertical"
      className="mt-8 min-h-0 flex-1 overflow-y-auto pr-3 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin]"
    >
      {children}
    </div>
  );
}

function MetaChips({ data, size }: { data: PresentationData; size: PresentationMode }) {
  const chips = [
    { key: "discipline", text: data.disciplineName, tone: "border-slate-200 text-slate-700" },
    { key: "subject", text: data.subjectName, tone: "border-slate-200 text-slate-700" },
    { key: "board", text: data.boardName, tone: "border-orange-200 text-orange-700" },
  ].filter((chip) => chip.text);

  const chipSize =
    size === "vertical"
      ? "rounded-full border-2 bg-white px-6 py-2.5 text-[24px] font-bold"
      : "rounded-full border bg-white px-4 py-1.5 text-sm font-bold";

  return (
    <div className={`flex flex-wrap ${size === "vertical" ? "gap-3" : "gap-2"}`} data-presentation-meta>
      {size === "vertical" && (
        <span className="rounded-full bg-slate-950 px-6 py-2.5 text-[24px] font-black text-white">Questão {data.code}</span>
      )}
      {chips.map((chip) => (
        <span key={chip.key} className={`${chipSize} ${chip.tone}`}>
          {chip.text}
        </span>
      ))}
    </div>
  );
}

function QuestionBody({
  question,
  data,
  variant,
  showAnswer,
  showComment,
  showSource,
}: {
  question: Question;
  data: PresentationData;
  variant: PresentationMode;
  showAnswer: boolean;
  showComment: boolean;
  showSource: boolean;
}) {
  const styles = VARIANT_STYLES[variant];
  const answerIsErrado = data.isTrueFalse && isErradoAlternative(data.correctAlternative);
  const answerLabel = data.isTrueFalse ? data.correctAlternative?.text : data.correctAlternative?.label;

  return (
    <div className="text-slate-950">
      {showSource && (
        <p data-presentation-source className={`flex flex-wrap items-baseline border-orange-500 ${styles.source}`}>
          <span className={`font-black uppercase tracking-[0.18em] text-orange-600 ${styles.sourceLabel}`}>Fonte</span>
          {data.sourceParts.length > 0 ? (
            <span className="font-semibold text-slate-700">{data.sourceParts.join(" • ")}</span>
          ) : (
            <span className="font-medium italic text-slate-500">Fonte não informada</span>
          )}
        </p>
      )}

      {question.image_url ? (
        <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={question.image_url} alt="Imagem do enunciado" className={`${styles.image} w-full object-contain`} />
        </div>
      ) : null}

      <div
        data-presentation-statement
        className={`${RICH_CONTENT_CLASS} ${styles.statement} text-slate-950`}
        dangerouslySetInnerHTML={toPresentationHtml(question.statement)}
      />

      <div className={styles.altList} data-presentation-alternatives>
        {data.alternatives.map((alternative) => {
          const revealedCorrect = showAnswer && Boolean(alternative.is_correct);
          const revealedErrado = revealedCorrect && data.isTrueFalse && isErradoAlternative(alternative);

          const cardTone = revealedErrado
            ? "border-red-400 bg-red-50"
            : revealedCorrect
              ? "border-emerald-400 bg-emerald-50"
              : "border-slate-200 bg-white";

          return (
            <div
              key={alternative.id || alternative.label}
              data-presentation-alternative={alternative.label}
              data-revealed-correct={revealedCorrect ? "true" : undefined}
              className={`${styles.altCard} ${cardTone} transition-colors`}
            >
              <div className={`flex items-start ${styles.altRow}`}>
                {data.isTrueFalse ? (
                  <span
                    className={`mt-1 flex shrink-0 items-center justify-center rounded-full border-2 leading-none ${styles.tfDot} ${
                      revealedErrado
                        ? "border-red-500 bg-red-500 text-white"
                        : revealedCorrect
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-orange-500 bg-white"
                    }`}
                  >
                    {revealedCorrect ? OWL_MARK : null}
                  </span>
                ) : (
                  <span
                    className={`flex shrink-0 items-center justify-center border-2 font-black ${styles.badge} ${
                      revealedCorrect
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  >
                    {revealedCorrect ? OWL_MARK : alternative.label}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  {alternative.image_url ? (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={alternative.image_url}
                        alt={`Imagem da alternativa ${alternative.label}`}
                        className={`${styles.altImage} w-full object-contain`}
                      />
                    </div>
                  ) : null}

                  <div
                    className={`${RICH_CONTENT_CLASS} ${styles.altText} text-slate-900`}
                    dangerouslySetInnerHTML={toPresentationHtml(alternative.text)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAnswer && (
        <div
          data-presentation-answer
          className={`${styles.answerBox} flex items-center gap-3 font-bold ${
            answerIsErrado ? "border-red-300 bg-red-50 text-red-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          <CheckCircle2 className={`shrink-0 ${answerIsErrado ? "text-red-600" : "text-emerald-600"}`} size={variant === "vertical" ? 40 : 24} />
          <span>
            Gabarito: <span className="font-black">{answerLabel || "não definido"}</span>
          </span>
        </div>
      )}

      {showComment && (
        <div data-presentation-comment className={`${styles.commentBox} border-orange-200 bg-orange-50`}>
          <p className={`mb-3 font-black text-orange-900 ${styles.commentTitle}`}>🦉 Análise do Professor Pablo Leonardo</p>
          <div
            className={`${RICH_CONTENT_CLASS} ${styles.commentText} text-orange-950`}
            dangerouslySetInnerHTML={toPresentationHtml(question.explanation_text)}
          />
          {variant === "normal" && <StudentExplanationAuthorCard />}
        </div>
      )}
    </div>
  );
}
