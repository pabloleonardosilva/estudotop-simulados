"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import TopCoinStack from "@/app/components/gamification/TopCoinStack";
import { formatTopCoinsLabel } from "@/app/lib/gamification/topcoins";
import {
  PremiumTable,
  PremiumTableBody,
  PremiumTableCell,
  PremiumTableHead,
  PremiumTableHeader,
  PremiumTableRow,
} from "@/app/components/ui/PremiumTable";

type EarningRow = {
  id: string;
  simulado_id: string;
  simulado_title: string;
  jornada_id: string | null;
  jornada_title: string | null;
  attempt_number: number;
  amount: number;
  created_at: string;
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

export default function ExtratoTopCoinsClient() {
  const router = useRouter();
  const [entries, setEntries] = useState<EarningRow[]>([]);
  const [balance, setBalance] = useState(0);
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

    const res = await fetch("/api/student/topcoins", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível carregar seu extrato de TopCoins.");
      setLoading(false);
      return;
    }

    setEntries(json.entries || []);
    setBalance(json.balance || 0);
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
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Extrato de TopCoins</h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-slate-600">
              TopCoin é a moeda universal do EstudoTOP Simulados. Você começa com zero e ganha moedas por acerto: 4 por questão na primeira tentativa, 2 na segunda e 1 da terceira em diante. No futuro, seus TopCoins garantirão vantagens dentro da plataforma.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3">
              <TopCoinStack size="lg" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-600">Saldo atual</p>
                <p className="text-2xl font-black text-orange-800">{formatTopCoinsLabel(balance)}</p>
              </div>
            </div>
            <Link
              href="/aluno"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-950 shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
            >
              <ArrowLeft size={16} /> Voltar para a área do aluno
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Carregando seu extrato...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{error}</div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          <TopCoinStack size="lg" className="mx-auto" />
          <p className="mt-4">Você ainda não ganhou nenhuma TopCoin.</p>
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
              <PremiumTableHeader>Jornada</PremiumTableHeader>
              <PremiumTableHeader>Simulado</PremiumTableHeader>
              <PremiumTableHeader>Tentativa</PremiumTableHeader>
              <PremiumTableHeader>Ganho</PremiumTableHeader>
              <PremiumTableHeader align="right">Data</PremiumTableHeader>
            </tr>
          </PremiumTableHead>
          <PremiumTableBody>
            {entries.map((row, index) => (
              <PremiumTableRow key={row.id} index={index}>
                <PremiumTableCell>{row.jornada_title || "Simulado avulso"}</PremiumTableCell>
                <PremiumTableCell>
                  <span className="font-bold text-slate-900">{row.simulado_title}</span>
                </PremiumTableCell>
                <PremiumTableCell>{row.attempt_number}ª tentativa</PremiumTableCell>
                <PremiumTableCell>
                  <span className="inline-flex items-center gap-1.5 font-black text-orange-700">
                    <TopCoinStack size="sm" /> {formatTopCoinsLabel(row.amount)}
                  </span>
                </PremiumTableCell>
                <PremiumTableCell align="right">{formatDateTime(row.created_at)}</PremiumTableCell>
              </PremiumTableRow>
            ))}
          </PremiumTableBody>
        </PremiumTable>
      )}
    </div>
  );
}
