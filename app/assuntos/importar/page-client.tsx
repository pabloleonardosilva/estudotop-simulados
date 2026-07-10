"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Layers3, Save, XCircle } from "lucide-react";
import PageBackground from "../../components/ui/PageBackground";
import PageHeader from "../../components/ui/PageHeader";
import PremiumButton from "../../components/ui/PremiumButton";
import PremiumCard from "../../components/ui/PremiumCard";
import PremiumInput from "../../components/ui/PremiumInput";
import PremiumSelect from "../../components/ui/PremiumSelect";
import PremiumLoadingOverlay from "../../components/ui/PremiumLoadingOverlay";
import { adminFetch } from "@/lib/supabase/adminFetch";

type Feedback = { type: "success" | "error"; message: string } | null;

export default function ImportarAssuntosClient({ disciplines }: { disciplines: any[] }) {
  const [disciplineId, setDisciplineId] = useState("");
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setFeedback(null);

    if (!disciplineId) return setFeedback({ type: "error", message: "Selecione uma disciplina." });
    if (!text.trim()) return setFeedback({ type: "error", message: "Digite um assunto por linha." });

    setLoading(true);

    try {
      const response = await adminFetch("/api/admin/subjects/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discipline_id: disciplineId, text }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao cadastrar assuntos.");

      setFeedback({ type: "success", message: result.message });
      setText("");
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar assuntos." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageBackground>
      <PremiumLoadingOverlay show={loading} title="Cadastrando assuntos..." message="Processando linhas informadas." />

      <PageHeader
        title="Importar assuntos em massa"
        description="Cadastre vários assuntos de uma vez, um por linha."
        action={<Link href="/assuntos"><PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>Voltar</PremiumButton></Link>}
      />

      {feedback && <Notice feedback={feedback} />}

      <PremiumCard title="Assuntos em massa" description="Escolha a disciplina e informe um assunto por linha." icon={<Layers3 size={18} />}>
        <div className="grid gap-5">
          <PremiumSelect label="Disciplina" value={disciplineId} onChange={(event: any) => setDisciplineId(event.target.value)}>
            <option value="">Selecione</option>
            {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
          </PremiumSelect>

          <PremiumInput
            label="Assuntos"
            textarea
            value={text}
            onChange={(event: any) => setText(event.target.value)}
            placeholder={`Microsoft Windows\nMicrosoft Word\nMicrosoft Excel\nMicrosoft PowerPoint\nSegurança da Informação`}
          />

          <div className="flex justify-end">
            <PremiumButton icon={<Save size={16} />} onClick={handleSave}>Cadastrar assuntos</PremiumButton>
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
