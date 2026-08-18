"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, ListChecks, Save } from "lucide-react";
import PageBackground from "../../components/ui/PageBackground";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import PremiumModal from "../../components/ui/PremiumModal";
import { normalizeBoardComparableName, normalizeBoardName } from "@/lib/utils/text";
import { adminFetch } from "@/app/lib/supabase/adminFetch";

type Feedback = { type: "success" | "error"; message: string } | null;
type Board = { id: string; name: string };

export default function ImportarBancasClient({ boards }: { boards: Board[] }) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [loading, setLoading] = useState(false);
  const existingBoardsByTypedLine = useMemo(() => {
    const typedNames = Array.from(new Set(text.split(/\r?\n/).map(normalizeBoardName).filter(Boolean)));

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
    <PageBackground variant="jornada">
      <PremiumLoadingOverlay show={loading} title="Cadastrando bancas..." message="Processando linhas informadas." />
      {feedback && <Notice feedback={feedback} onClose={() => setFeedback(null)} />}

      <section className="relative mb-6 overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[linear-gradient(115deg,rgba(255,122,0,0.11)_0%,rgba(12,30,52,0.94)_48%,rgba(2,8,23,0.98)_100%)] px-6 py-7 shadow-[0_20px_60px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-8">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/[0.10] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-[-8rem] h-64 w-64 rounded-full bg-orange-500/[0.12] blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-400">EstudoTOP Simulados</p>
            <h1 className="mt-2.5 text-[30px] font-bold leading-[1.05] tracking-[-0.04em] text-white sm:text-[36px]">Importar bancas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Cadastre várias bancas de uma vez, informando uma por linha.</p>
          </div>
          <Link href="/bancas" className="shrink-0">
            <PremiumButton variant="dark" icon={<ArrowLeft size={17} />}>Voltar</PremiumButton>
          </Link>
        </div>
      </section>

      <section className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#0C1E34]/70 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-[1.9rem] bg-gradient-to-b from-orange-400/[0.08] via-white/[0.02] to-transparent blur-2xl" />
        <div className="grid lg:grid-cols-2">
          <aside className="border-b border-white/[0.07] bg-[#07111F]/55 p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/[0.10] text-orange-300"><ListChecks size={20} strokeWidth={2.2} /></div>
            <h2 className="mt-5 text-lg font-bold tracking-tight text-white">Importação rápida</h2>
            <p className="mt-2 text-[13px] leading-5 text-slate-400">Cole sua lista e deixe o sistema organizar o cadastro.</p>
            <div className="mt-6 space-y-3 border-t border-white/[0.07] pt-5 text-[13px] text-slate-300">
              <p className="flex items-start gap-2.5"><Check className="mt-0.5 shrink-0 text-emerald-300" size={15} /><span>Use uma banca por linha.</span></p>
              <p className="flex items-start gap-2.5"><Check className="mt-0.5 shrink-0 text-emerald-300" size={15} /><span>Nomes são normalizados automaticamente.</span></p>
              <p className="flex items-start gap-2.5"><Check className="mt-0.5 shrink-0 text-emerald-300" size={15} /><span>Duplicidades serão ignoradas com segurança.</span></p>
            </div>
          </aside>

          <div className="p-6 sm:p-7 lg:p-8">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/[0.08] text-orange-300"><BadgeCheck size={18} /></div>
              <div><h3 className="font-bold text-white">Lista de bancas</h3><p className="mt-1 text-xs leading-5 text-slate-400">Digite ou cole os nomes abaixo.</p></div>
            </div>
            <PremiumInput
              label="Bancas"
              textarea
              variant="jornada"
              value={text}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(event.target.value)}
              placeholder={`VUNESP\nCEBRASPE\nFCC\nFGV\nIBFC`}
              className="min-h-44 resize-y border-white/[0.08] bg-[#020817]/55 leading-6 focus:border-orange-400/55 sm:min-h-48"
            />

            {existingBoardsByTypedLine.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
                <p className="font-bold text-amber-200">Bancas equivalentes já existentes:</p>
                <ul className="mt-2 list-inside list-disc">
                  {existingBoardsByTypedLine.map(({ typedName, existing }) => (
                    <li key={`${typedName}-${existing.id}`}>{typedName} -&gt; {existing.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex justify-end border-t border-white/[0.07] pt-5">
            <PremiumButton
              variant="dark"
              icon={<Save size={16} />}
              onClick={handleSave}
              disabled={loading}
              className="h-12 border-orange-300/30 bg-[linear-gradient(135deg,#f97316_0%,#f59e0b_100%)] px-6 font-extrabold text-white shadow-[0_14px_32px_rgba(249,115,22,0.25)] hover:-translate-y-0.5 hover:border-orange-200/50 hover:text-white hover:shadow-[0_18px_38px_rgba(249,115,22,0.34)]"
            >
              Cadastrar bancas
            </PremiumButton>
            </div>
          </div>
        </div>
      </section>
    </PageBackground>
  );
}

function Notice({ feedback, onClose }: { feedback: NonNullable<Feedback>; onClose: () => void }) {
  const ok = feedback.type === "success";

  return (
    <PremiumModal
      open
      theme="dark"
      tone={ok ? "success" : "error"}
      title={ok ? "Importação concluída" : "Não foi possível importar"}
      message={feedback.message}
      onClose={onClose}
    />
  );
}
