"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CheckCircle2, Save, XCircle } from "lucide-react";
import PageBackground from "../../components/ui/PageBackground";
import PageHeader from "../../components/ui/PageHeader";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumCard from "../../components/ui/PremiumCard";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import { normalizeBoardComparableName, normalizeBoardName } from "@/lib/utils/text";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Feedback = { type: "success" | "error"; message: string } | null;
type Board = { id: string; name: string };

export default function ImportarBancasClient({ boards }: { boards: Board[] }) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [loading, setLoading] = useState(false);
  const existingBoardsByTypedLine = useMemo(() => {
    const typedNames = Array.from(
      new Set(text.split(/\r?\n/).map(normalizeBoardName).filter(Boolean)),
    );

    return typedNames
      .map((typedName) => {
        const existing = boards.find(
          (board) => normalizeBoardComparableName(board.name) === normalizeBoardComparableName(typedName),
        );

        return existing ? { typedName, existing } : null;
      })
      .filter((item): item is { typedName: string; existing: Board } => Boolean(item));
  }, [boards, text]);

  async function handleSave() {
    setFeedback(null);
    if (!text.trim()) return setFeedback({ type: "error", message: "Digite uma banca por linha." });

    setLoading(true);

    try {
      const response = await adminFetch("/api/admin/exam-boards/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao cadastrar bancas.");

      setFeedback({ type: "success", message: result.message });
      setText("");
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar bancas." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageBackground>
      <PremiumLoadingOverlay show={loading} title="Cadastrando bancas..." message="Processando linhas informadas." />

      <PageHeader
        title="Importar bancas em massa"
        description="Cadastre várias bancas de uma vez, uma por linha."
        action={<Link href="/bancas"><PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>Voltar</PremiumButton></Link>}
      />

      {feedback && <Notice feedback={feedback} />}

      <PremiumCard title="Bancas em massa" description="Informe uma banca por linha. Duplicadas serão ignoradas." icon={<BadgeCheck size={18} />}>
        <div className="grid gap-5">
          <PremiumInput
            label="Bancas"
            textarea
            value={text}
            onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(event.target.value)}
            placeholder={`VUNESP\nCEBRASPE\nFCC\nFGV\nIBFC`}
          />

          {existingBoardsByTypedLine.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Bancas equivalentes já existentes:</p>
              <ul className="mt-2 list-inside list-disc">
                {existingBoardsByTypedLine.map(({ typedName, existing }) => (
                  <li key={`${typedName}-${existing.id}`}>
                    {typedName} -&gt; {existing.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <PremiumButton icon={<Save size={16} />} onClick={handleSave}>Cadastrar bancas</PremiumButton>
          </div>
        </div>
      </PremiumCard>
    </PageBackground>
  );
}

function Notice({ feedback }: { feedback: NonNullable<Feedback> }) {
  const ok = feedback.type === "success";

  return (
    <div className={ok ? "mb-6 flex items-center gap-3 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800" : "mb-6 flex items-center gap-3 rounded-[2rem] border border-red-200 bg-red-50 p-5 text-red-800"}>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
        {ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      </div>
      <p className="font-medium">{feedback.message}</p>
    </div>
  );
}
