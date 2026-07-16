"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList, Trophy } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import {
  PremiumTable,
  PremiumTableBody,
  PremiumTableCell,
  PremiumTableHead,
  PremiumTableHeader,
  PremiumTableRow,
} from "@/app/components/ui/PremiumTable";

type ResultadoRow = {
  simulado_id: string;
  simulado_title: string;
  jornada_title: string | null;
  submitted_at: string | null;
};

export default function MeusResultadosClient() {
  const router = useRouter();
  const [results, setResults] = useState<ResultadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const res = await fetch("/api/student/resultados", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível carregar seus resultados.");
      setLoading(false);
      return;
    }

    setResults(json.results || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-full bg-[#f6f7f9] px-5 py-7 md:px-8 lg:px-10">
      <section className="relative mb-7 overflow-hidden rounded-[1.35rem] border border-slate-200/90 bg-white/95 px-6 py-7 shadow-[0_18px_54px_rgba(15,23,42,0.08)] ring-1 ring-white md:px-10">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[34rem] opacity-80 [background:radial-gradient(circle_at_72%_44%,rgba(255,133,0,0.10),transparent_30%),radial-gradient(circle_at_55%_48%,rgba(255,176,0,0.07),transparent_34%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.36em] text-orange-600">Área do aluno</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Meus Resultados</h1>
            <p className="mt-3 text-base font-medium text-slate-600">Acompanhe o resultado de cada simulado que você já concluiu.</p>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              Mesmo quando um simulado permite várias tentativas, o resultado apresentado nesta página corresponde à sua primeira tentativa completa. Essa tentativa é considerada o retrato mais fiel do seu desempenho inicial e, por isso, é utilizada como resultado oficial no seu histórico. As tentativas seguintes continuam sendo úteis para revisão e treinamento, mas não substituem esse resultado oficial.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/aluno"
              className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-950 shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
            >
              <ArrowLeft size={18} /> Voltar para a área do aluno
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Carregando seus resultados...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error}</div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          <Trophy className="mx-auto text-orange-400" size={36} />
          <p className="mt-4">Você ainda não concluiu nenhum simulado.</p>
          <Link
            href="/meus-simulados"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-[linear-gradient(180deg,#FFA048_0%,#FE7C00_55%,#FF5700_100%)] px-6 text-sm font-black text-white shadow-sm"
          >
            <ClipboardList size={16} /> Ir para meus simulados
          </Link>
        </div>
      ) : (
        <PremiumTable>
          <PremiumTableHead>
            <tr>
              <PremiumTableHeader>Simulado</PremiumTableHeader>
              <PremiumTableHeader>Jornada</PremiumTableHeader>
              <PremiumTableHeader align="right">Ação</PremiumTableHeader>
            </tr>
          </PremiumTableHead>
          <PremiumTableBody>
            {results.map((row, index) => (
              <PremiumTableRow key={row.simulado_id} index={index}>
                <PremiumTableCell>
                  <span className="font-bold text-slate-900">{row.simulado_title}</span>
                </PremiumTableCell>
                <PremiumTableCell>{row.jornada_title || "Simulado avulso"}</PremiumTableCell>
                <PremiumTableCell align="right">
                  <Link
                    href={`/meus-simulados/${row.simulado_id}/resultado`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-xs font-black text-orange-700 transition hover:bg-orange-100"
                  >
                    Ver resultado <ArrowRight size={14} />
                  </Link>
                </PremiumTableCell>
              </PremiumTableRow>
            ))}
          </PremiumTableBody>
        </PremiumTable>
      )}
    </div>
  );
}
