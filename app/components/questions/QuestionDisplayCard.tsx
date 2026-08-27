import { CheckCircle2, XCircle } from "lucide-react";
import { qCard } from "@/lib/ui/question-tokens";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";
import PremiumScissorsIcon from "@/app/components/questions/PremiumScissorsIcon";

const OWL_MARK = "\u{1F989}\uFE0F";

type Alternative = { id?: string; label?: string | null; text?: string | null; image_url?: string | null; is_correct?: boolean | null; order_number?: number | null };

type QuestionLike = {
  id?: string;
  code?: string | null;
  question_code?: string | null;
  public_code?: string | null;
  statement?: string | null;
  image_url?: string | null;
  year?: number | string | null;
  question_type?: string | null;
  difficulty_level?: number | null;
  question_alternatives?: Alternative[];
  alternatives?: Alternative[];
  exam_boards?: { name?: string | null } | null;
  subjects?: { name?: string | null; disciplines?: { name?: string | null } | null } | null;
  exam_board?: string | null;
  subject?: string | null;
};

function html(value?: string | null) {
  return value || "";
}

function codeOf(question: QuestionLike, fallback?: string) {
  return question.code || question.question_code || question.public_code || fallback || (question.id ? `Q${String(question.id).slice(0, 8).toUpperCase()}` : "Questão");
}

function stars(level?: number | null) {
  return <PremiumDifficultyStars value={level} compact />;
}

function isTrueFalseWrong(questionType?: string | null, alternative?: Alternative) {
  return questionType === "true_false" && Boolean(alternative?.is_correct) && (alternative?.label === "E" || String(alternative?.text || "").trim().toLowerCase() === "errado");
}

function alternativeDisplayLabel(questionType: string | null | undefined, alternative: Alternative, fallback: string, showCorrect: boolean, isCorrect: boolean) {
  if (showCorrect && isCorrect) return OWL_MARK;
  if (questionType === "true_false") return "";
  return alternative.label || fallback;
}

export default function QuestionDisplayCard({
  question,
  orderLabel,
  showCorrect = true,
  selectedAlternativeId,
  onSelect,
  disabled = false,
  extraBadges,
  markIncorrect = false,
  renderAlternativeMeta,
  presentationMode = false,
  presentationControls,
  presentationFontScale = 1,
  eliminatedAlternativeIds = [],
  onToggleEliminate,
}: {
  question: QuestionLike;
  orderLabel?: string;
  showCorrect?: boolean;
  selectedAlternativeId?: string | null;
  onSelect?: (alt: Alternative) => void;
  disabled?: boolean;
  extraBadges?: React.ReactNode;
  markIncorrect?: boolean;
  renderAlternativeMeta?: (alternative: Alternative) => React.ReactNode;
  presentationMode?: boolean;
  presentationControls?: React.ReactNode;
  presentationFontScale?: number;
  eliminatedAlternativeIds?: string[];
  onToggleEliminate?: (alternativeId: string) => void;
}) {
  const alternatives = [...(question.question_alternatives || question.alternatives || [])].sort(
    (a, b) => Number(a.order_number || 0) - Number(b.order_number || 0),
  );
  const code = codeOf(question, orderLabel);
  const board = question.exam_boards?.name || question.exam_board;
  const subject = question.subjects?.name || question.subject;
  const discipline = question.subjects?.disciplines?.name;
  const statementFontClass = ["text-sm", "text-[15px]", "text-[17px]", "text-[19px]"][presentationFontScale] || "text-[15px]";
  const alternativeFontClass = ["text-sm", "text-[15px]", "text-[17px]", "text-[19px]"][presentationFontScale] || "text-[15px]";

  return (
    <article className={presentationMode ? "rounded-[24px] border border-slate-200/90 bg-white/95 shadow-[0_22px_58px_rgba(15,23,42,0.065),inset_0_1px_0_rgba(255,255,255,0.94)]" : qCard.wrapper}>
      <div className={presentationMode ? "p-5 sm:p-6 lg:p-8" : "p-6 md:p-8"}>
        <div className={qCard.tags.row}>
          <span className={qCard.tags.primary}>{orderLabel || code}</span>
          {orderLabel && <span className={qCard.tags.muted}>{code}</span>}
          {board && <span className={qCard.tags.brand}>{board}</span>}
          {question.year && <span className={qCard.tags.neutral}>Ano {question.year}</span>}
          {discipline && <span className={qCard.tags.neutral}>{discipline}</span>}
          {subject && <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">{subject}</span>}
          {stars(question.difficulty_level)}
          {extraBadges}
        </div>

        {presentationMode && presentationControls && <div className="mt-4 flex justify-end">{presentationControls}</div>}

        <div className={`richtext-editor ${presentationMode ? `mt-3 rounded-[18px] border border-slate-200/90 bg-gradient-to-b from-slate-50/70 to-white/90 px-5 py-4 ${statementFontClass} leading-[1.65] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] sm:px-6 sm:py-5` : qCard.statement}`} dangerouslySetInnerHTML={{ __html: html(question.statement) }} />

        {question.image_url && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <img src={question.image_url} alt="Imagem do enunciado" className="max-h-72 w-full rounded-xl object-contain" />
          </div>
        )}

        {alternatives.length > 0 && (
          <div className="mt-5 grid gap-3">
            {alternatives.map((alt, index) => {
              const isCorrect = Boolean(alt.is_correct);
              const isSelected = selectedAlternativeId === alt.id;
              const isEliminated = Boolean(alt.id && eliminatedAlternativeIds.includes(alt.id));
              const label = alt.label || String.fromCharCode(65 + index);
              const isWrongTrueFalse = isTrueFalseWrong(question.question_type, alt);
              const showWrong = showCorrect && (presentationMode ? markIncorrect && !isCorrect : isWrongTrueFalse || (markIncorrect && !isCorrect));
              const presentationClass = showWrong
                ? "min-h-[70px] rounded-[18px] border-[1.5px] border-red-300/80 bg-gradient-to-r from-rose-50 via-red-50/80 to-white/90 px-5 py-3.5 text-red-900 shadow-[0_12px_28px_rgba(239,68,68,0.065),inset_0_1px_0_rgba(255,255,255,0.92)]"
                : showCorrect && isCorrect
                  ? "min-h-[70px] rounded-[18px] border-[1.5px] border-emerald-400/60 bg-gradient-to-r from-emerald-50 via-green-50/80 to-white/90 px-5 py-3.5 text-emerald-900 shadow-[0_12px_28px_rgba(16,185,129,0.075),inset_0_1px_0_rgba(255,255,255,0.92)]"
                  : "min-h-[62px] rounded-2xl border border-slate-300/80 bg-white/85 px-5 py-4 text-[15px] font-medium text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.92)]";
              const cls = presentationMode ? presentationClass : showWrong ? qCard.alts.wrong : showCorrect && isCorrect ? qCard.alts.correct : isSelected ? qCard.alts.selected : `${qCard.alts.base} ${onSelect && !disabled ? "cursor-pointer hover:border-orange-200 hover:bg-orange-50" : ""}`;
              const labelCls = showWrong ? qCard.alts.labelWrong : showCorrect && isCorrect ? qCard.alts.labelCorrect : isSelected ? qCard.alts.labelSelected : qCard.alts.labelBase;
              const content = (
                <>
                  {presentationMode && alt.id && onToggleEliminate && <button type="button" aria-label={isEliminated ? "Remover eliminação da alternativa" : "Eliminar alternativa"} title={isEliminated ? "Reexibir alternativa" : "Eliminar alternativa"} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleEliminate(alt.id!); }} className={`group shrink-0 rounded-full transition duration-200 ${isEliminated ? "opacity-100" : "opacity-70 hover:opacity-100"}`}><PremiumScissorsIcon size={17} /></button>}
                  <span className={presentationMode ? `flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${showWrong ? "bg-gradient-to-br from-rose-400 to-red-500 text-white shadow-[0_8px_18px_rgba(239,68,68,0.20)]" : showCorrect && isCorrect ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_8px_18px_rgba(16,185,129,0.22)]" : "border border-slate-300/80 bg-white/80 text-xs font-bold text-slate-600"}` : labelCls}>
                    {presentationMode && showWrong ? <XCircle size={18} strokeWidth={2.4} /> : presentationMode && showCorrect && isCorrect ? <span className="text-base font-normal leading-none [font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',sans-serif]" aria-label="Alternativa correta">{OWL_MARK}</span> : alternativeDisplayLabel(question.question_type, alt, label, showCorrect, isCorrect)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`${presentationMode ? `${alternativeFontClass} leading-[1.6]` : qCard.alts.text} ${isEliminated ? "opacity-55 line-through decoration-2 decoration-red-500 [&_*]:line-through [&_*]:decoration-2 [&_*]:decoration-red-500" : ""}`} dangerouslySetInnerHTML={{ __html: html(alt.text) }} />
                    {alt.image_url && <img src={alt.image_url} alt={`Imagem alternativa ${label}`} className="mt-2 max-h-44 rounded-xl border border-slate-100 bg-white object-contain p-2" />}
                  </div>
                  {renderAlternativeMeta?.(alt)}
                  {!presentationMode && showCorrect && isCorrect && <CheckCircle2 className={`mt-1 shrink-0 ${isWrongTrueFalse ? "text-red-500" : "text-emerald-500"}`} size={18} />}
                  {!presentationMode && showCorrect && isSelected && !isCorrect && <XCircle className="mt-1 shrink-0 text-red-500" size={18} />}
                </>
              );
              if (onSelect) {
                return <button key={alt.id || label} type="button" disabled={disabled} onClick={() => onSelect(alt)} className={`${cls} flex w-full items-start gap-3 text-left disabled:cursor-default`}>{content}</button>;
              }
              return <div key={alt.id || label} className={`${cls} flex items-start gap-3`}>{content}</div>;
            })}
          </div>
        )}

        {showCorrect && alternatives.some((alt) => alt.is_correct) && (
          <div className={`mt-4 border px-4 py-3 text-sm font-bold ${presentationMode ? "min-h-11 rounded-[14px] border-emerald-400/60 bg-gradient-to-r from-emerald-50 to-white/90 text-emerald-700 shadow-[0_10px_24px_rgba(16,185,129,0.055),inset_0_1px_0_rgba(255,255,255,0.92)]" : question.question_type === "true_false" && isTrueFalseWrong(question.question_type, alternatives.find((alt) => alt.is_correct)) ? "rounded-2xl border-red-200 bg-red-50 text-red-800" : "rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            Gabarito: {question.question_type === "true_false" ? (alternatives.find((alt) => alt.is_correct)?.text || "correta") : `Alternativa ${alternatives.find((alt) => alt.is_correct)?.label || "correta"}`}
          </div>
        )}
      </div>
    </article>
  );
}
