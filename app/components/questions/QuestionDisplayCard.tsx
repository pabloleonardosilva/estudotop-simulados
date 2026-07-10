import { CheckCircle2, Copy, XCircle } from "lucide-react";
import { qCard } from "@/lib/ui/question-tokens";
import PremiumDifficultyStars from "@/app/components/questions/PremiumDifficultyStars";

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
}: {
  question: QuestionLike;
  orderLabel?: string;
  showCorrect?: boolean;
  selectedAlternativeId?: string | null;
  onSelect?: (alt: Alternative) => void;
  disabled?: boolean;
  extraBadges?: React.ReactNode;
}) {
  const alternatives = [...(question.question_alternatives || question.alternatives || [])].sort(
    (a, b) => Number(a.order_number || 0) - Number(b.order_number || 0),
  );
  const code = codeOf(question, orderLabel);
  const board = question.exam_boards?.name || question.exam_board;
  const subject = question.subjects?.name || question.subject;
  const discipline = question.subjects?.disciplines?.name;

  return (
    <article className={qCard.wrapper}>
      <div className="p-6 md:p-8">
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

        <div className={`richtext-editor ${qCard.statement}`} dangerouslySetInnerHTML={{ __html: html(question.statement) }} />

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
              const label = alt.label || String.fromCharCode(65 + index);
              const isWrongTrueFalse = isTrueFalseWrong(question.question_type, alt);
              const cls = showCorrect && isWrongTrueFalse ? qCard.alts.wrong : showCorrect && isCorrect ? qCard.alts.correct : isSelected ? qCard.alts.selected : `${qCard.alts.base} ${onSelect && !disabled ? "cursor-pointer hover:border-orange-200 hover:bg-orange-50" : ""}`;
              const labelCls = showCorrect && isWrongTrueFalse ? qCard.alts.labelWrong : showCorrect && isCorrect ? qCard.alts.labelCorrect : isSelected ? qCard.alts.labelSelected : qCard.alts.labelBase;
              const content = (
                <>
                  <span className={labelCls}>{alternativeDisplayLabel(question.question_type, alt, label, showCorrect, isCorrect)}</span>
                  <div className="min-w-0 flex-1">
                    <div className={qCard.alts.text} dangerouslySetInnerHTML={{ __html: html(alt.text) }} />
                    {alt.image_url && <img src={alt.image_url} alt={`Imagem alternativa ${label}`} className="mt-2 max-h-44 rounded-xl border border-slate-100 bg-white object-contain p-2" />}
                  </div>
                  {showCorrect && isCorrect && <CheckCircle2 className={`mt-1 shrink-0 ${isWrongTrueFalse ? "text-red-500" : "text-emerald-500"}`} size={18} />}
                  {showCorrect && isSelected && !isCorrect && <XCircle className="mt-1 shrink-0 text-red-500" size={18} />}
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
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${question.question_type === "true_false" && isTrueFalseWrong(question.question_type, alternatives.find((alt) => alt.is_correct)) ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            Gabarito: {question.question_type === "true_false" ? (alternatives.find((alt) => alt.is_correct)?.text || "correta") : `Alternativa ${alternatives.find((alt) => alt.is_correct)?.label || "correta"}`}
          </div>
        )}
      </div>
    </article>
  );
}
