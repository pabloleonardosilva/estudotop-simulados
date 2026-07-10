"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Check, CheckCircle2, FileSearch, FileText, Layers3, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { splitIntoQuestionBlocks } from "@/app/lib/utils/question-splitter";
import type { BoardOption, DisciplineOption } from "../types";
import { adminFetch } from "@/lib/supabase/adminFetch";

type EntityOption = { id: string; name: string };
type Props = { disciplines: DisciplineOption[]; boards: BoardOption[]; contests: EntityOption[]; positions: EntityOption[] };
type Feedback = { type: "success" | "error" | "warning"; message: string } | null;

function normalizeComparable(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .trim();
}

/** Contador animado 0 → ~90% enquanto ativa, salta para 100% quando concluída */
function StepPct({ active, done }: { active: boolean; done: boolean }) {
  const [pct, setPct] = useState(done ? 100 : 0);

  useEffect(() => {
    if (done) { setPct(100); return; }
    if (!active) { setPct(0); return; }
    let cur = 0;
    setPct(0);
    const id = setInterval(() => {
      cur += Math.random() * 4 + 1.5;
      if (cur >= 88) { clearInterval(id); setPct(88); return; }
      setPct(Math.round(cur));
    }, 90);
    return () => clearInterval(id);
  }, [active, done]);

  if (done) return <span className="text-xs font-black text-emerald-300">100%</span>;
  if (active) return <span className="text-xs font-black text-orange-300">{pct}%</span>;
  return <span className="text-xs font-bold text-slate-700">0%</span>;
}

function buildAnalysisTitle(contestName: string, positionName: string, examYear: string, boardName: string) {
  const contest = contestName.trim() || "Concurso";
  const position = positionName.trim() || "Cargo";
  const year = examYear.trim() || "Ano";
  const board = boardName.trim() || "Banca";
  return `RaioX - Prova - ${contest} - ${position} - ${year} - ${board}`;
}

export default function NovaRaioXProvaClient({ disciplines, boards, contests, positions }: Props) {
  const router = useRouter();
  const defaultDiscipline = useMemo(() => disciplines.find((d) => /inform[aá]tica|ti/i.test(d.name)) || disciplines[0] || null, [disciplines]);
  const [contestOptions, setContestOptions] = useState<EntityOption[]>(contests || []);
  const [contestId, setContestId] = useState("");
  const [contestSearch, setContestSearch] = useState("");
  const [positionOptions, setPositionOptions] = useState<EntityOption[]>(positions || []);
  const [positionId, setPositionId] = useState("");
  const [positionSearch, setPositionSearch] = useState("");
  const contestName = contestSearch;
  const positionName = positionSearch;
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [boardOptions, setBoardOptions] = useState<BoardOption[]>(boards || []);
  const [boardId, setBoardId] = useState("");
  const [boardSearch, setBoardSearch] = useState("");
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [disciplineId, setDisciplineId] = useState(defaultDiscipline?.id || "");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // ── Modal de processamento ─────────────────────────────────────────────────
  const [processingModal, setProcessingModal] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [detectedCount, setDetectedCount] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STEPS = [
    { label: "Sanitizando e dividindo o texto", weight: 10 },
    { label: "Detectando blocos de questões", weight: 15 },
    { label: "Enviando para análise com IA", weight: 20 },
    { label: "Processando resultado da IA", weight: 30 },
    { label: "Salvando questões no banco", weight: 17 },
    { label: "Concluído", weight: 8 },
  ];

  // Progresso cumulativo: soma dos pesos das tarefas concluídas
  const progressPct = STEPS.slice(0, Math.min(processingStep + 1, STEPS.length))
    .reduce((sum, s) => sum + s.weight, 0);

  const selectedDiscipline = disciplines.find((d) => d.id === disciplineId);
  const selectedBoard = boardOptions.find((board) => board.id === boardId) || null;
  const resolvedBoardName = selectedBoard?.name || "";
  const generatedTitle = buildAnalysisTitle(contestName, positionName, examYear, resolvedBoardName);

  const filteredBoards = useMemo(() => {
    const search = normalizeComparable(boardSearch);
    if (!search) return [];
    return boardOptions.filter((board) => normalizeComparable(board.name).includes(search)).slice(0, 40);
  }, [boardOptions, boardSearch]);

  const typedBoardAlreadyExists = newBoardName.trim()
    ? boardOptions.find((board) => normalizeComparable(board.name) === normalizeComparable(newBoardName))
    : null;

  async function createBoardInline() {
    setFeedback(null);
    const name = newBoardName.trim();

    if (!name) {
      setFeedback({ type: "error", message: "Informe o nome da banca." });
      return;
    }

    setCreatingBoard(true);
    try {
      const response = await adminFetch("/api/admin/exam-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Erro ao cadastrar banca.");

      const board = result.board as BoardOption;
      setBoardOptions((current) => {
        const alreadyExists = current.some((item) => item.id === board.id);
        if (alreadyExists) return current;
        return [...current, board].sort((a, b) => a.name.localeCompare(b.name));
      });
      setBoardId(board.id);
      setBoardSearch(board.name);
      setNewBoardName("");
      setShowBoardModal(false);
      setFeedback({ type: "success", message: result.created ? "Banca cadastrada e selecionada." : "Banca já existia e foi selecionada." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar banca." });
    } finally {
      setCreatingBoard(false);
    }
  }

  function advanceStep(step: number, delayMs = 0) {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (delayMs > 0) {
      stepTimerRef.current = setTimeout(() => setProcessingStep(step), delayMs);
    } else {
      setProcessingStep(step);
    }
  }

  async function handleAnalyze() {
    setFeedback(null);

    if (!contestName.trim() || !positionName.trim() || !examYear.trim() || !resolvedBoardName.trim()) {
      setFeedback({ type: "error", message: "Preencha Órgão, Cargo, Ano e selecione uma Banca antes de analisar." });
      return;
    }
    if (!content.trim() || content.trim().length < 40) {
      setFeedback({ type: "error", message: "Cole o texto da prova no editor antes de analisar." });
      return;
    }

    // ── Passo 0: abre modal e sanitiza texto ─────────────────────────────────
    setProcessingStep(0);
    setDetectedCount(0);
    setProcessingModal(true);
    setLoading(true);

    // ── Passo 1: detecta blocos usando as mesmas regras do Importador com IA ──
    await new Promise((r) => setTimeout(r, 300));
    const blocks = splitIntoQuestionBlocks(content);
    setDetectedCount(blocks.length);
    advanceStep(1);

    // ── Passo 2: valida questões detectadas ────────────────────────────────────
    if (blocks.length === 0) {
      setProcessingModal(false);
      setLoading(false);
      setFeedback({ type: "error", message: "Nenhuma questão foi detectada no texto. Verifique o formato: questões devem ser numeradas (ex: '1.' ou 'Q001')." });
      return;
    }

    // ── Passo 2→3: envia para a IA ────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 400));
    advanceStep(2);

    try {
      const response = await adminFetch("/api/admin/exam-analyses/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: generatedTitle,
          contest_name: contestName.trim(),
          position_name: positionName.trim(),
          exam_year: Number(examYear),
          board_name: resolvedBoardName.trim(),
          board_id: boardId || null,
          discipline_id: disciplineId || null,
          discipline_name: selectedDiscipline?.name || "Informática/TI",
          raw_content: content,
        }),
      });

      // ── Passo 3: processa resultado ────────────────────────────────────────
      advanceStep(3);
      await new Promise((r) => setTimeout(r, 300));

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao analisar prova.");

      // ── Passo 4: salvo ─────────────────────────────────────────────────────
      advanceStep(4);
      await new Promise((r) => setTimeout(r, 350));

      // ── Passo 5: concluído ─────────────────────────────────────────────────
      advanceStep(5);
      await new Promise((r) => setTimeout(r, 500));

      setProcessingModal(false);
      router.push(`/admin/raio-x-provas/${data.id}`);
    } catch (error) {
      setProcessingModal(false);
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro inesperado ao analisar prova." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-full bg-[#07111F] px-4 py-6 text-white md:px-8">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute left-[-12%] top-[-10%] h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      {/* ── MODAL DE PROCESSAMENTO PREMIUM ────────────────────────────────── */}
      {processingModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/[0.10] bg-[#0B1424] p-8 shadow-2xl shadow-black/60">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/15 text-orange-300">
                {processingStep === STEPS.length - 1
                  ? <CheckCircle2 size={30} className="text-emerald-400" />
                  : <Sparkles size={28} className="animate-pulse" />}
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-orange-300">
                Raio-X de Provas · IA em ação
              </p>
              <h3 className="mt-2 text-2xl font-black text-white">
                {processingStep === STEPS.length - 1 ? "Análise concluída!" : "Analisando a prova"}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                {STEPS[Math.min(processingStep, STEPS.length - 1)].label}
                {detectedCount > 0 && processingStep >= 1 && (
                  <span className="ml-2 font-semibold text-orange-300">· {detectedCount} quest{detectedCount !== 1 ? "ões" : "ão"} detectada{detectedCount !== 1 ? "s" : ""}</span>
                )}
              </p>
            </div>

            {/* Barra de progresso */}
            <div className="mb-6 h-3 overflow-hidden rounded-full bg-white/[0.06] shadow-inner shadow-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mb-5 text-right text-sm font-black text-orange-300">{progressPct}%</p>

            {/* Steps */}
            <div className="space-y-2">
              {STEPS.map((step, i) => {
                const done = i < processingStep;
                const active = i === processingStep;
                return (
                  <div key={i} className={`relative overflow-hidden rounded-2xl border px-4 py-3 transition-all ${
                    done ? "border-emerald-400/25 bg-emerald-400/[0.07]"
                    : active ? "border-orange-400/35 bg-orange-500/[0.10] shadow-lg shadow-orange-950/20"
                    : "border-white/[0.05] bg-white/[0.025]"
                  }`}>
                    {active && (
                      <div className="pointer-events-none absolute inset-y-0 left-0 animate-[progressPulse_1.5s_ease-in-out_infinite] w-1/2 bg-gradient-to-r from-transparent via-orange-500/10 to-transparent" />
                    )}
                    <div className="relative flex items-center gap-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black shadow-sm ${
                        done ? "bg-emerald-400 text-slate-950"
                        : active ? "bg-orange-400 text-slate-950"
                        : "bg-white/[0.08] text-slate-500"
                      }`}>
                        {done ? <CheckCircle2 size={13} /> : i + 1}
                      </span>
                      <span className={`flex-1 text-sm font-bold ${
                        done ? "text-emerald-200" : active ? "text-orange-100" : "text-slate-600"
                      }`}>{step.label}</span>
                      <StepPct active={active} done={done} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Estatísticas */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { icon: <FileText size={15} />, label: "Texto", value: `${content.length} chars` },
                { icon: <Layers3 size={15} />, label: "Detectadas", value: detectedCount > 0 ? String(detectedCount) : "—" },
                { icon: <Sparkles size={15} />, label: "Status", value: processingStep === STEPS.length - 1 ? "Pronto" : "Analisando" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                  <span className="text-orange-400">{s.icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{s.label}</span>
                  <span className="text-sm font-black text-white">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showBoardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/[0.08] bg-[#0B1424] p-6 text-white shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-200">Nova banca</p>
                <h3 className="mt-2 text-xl font-black">Cadastrar banca organizadora</h3>
                <p className="mt-1 text-sm text-slate-400">Use este cadastro quando a banca ainda não existir no banco.</p>
              </div>
              <button type="button" onClick={() => setShowBoardModal(false)} className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5">
              <Input label="Nome da banca" value={newBoardName} onChange={setNewBoardName} placeholder="Ex.: VUNESP" onKeyDown={(event) => {
                if (event.key === "Enter") createBoardInline();
                if (event.key === "Escape") setShowBoardModal(false);
              }} />
              {typedBoardAlreadyExists && (
                <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
                  Já existe uma banca equivalente: {typedBoardAlreadyExists.name}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowBoardModal(false); setNewBoardName(""); }} className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                Cancelar
              </button>
              <button type="button" onClick={createBoardInline} disabled={creatingBoard} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                {creatingBoard ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}
                {creatingBoard ? "Cadastrando..." : "Cadastrar e selecionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="relative mx-auto max-w-7xl space-y-7">
        <div className="flex items-center justify-between">
          <Link href="/admin/raio-x-provas" className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
            <ArrowLeft size={17} /> Voltar
          </Link>
        </div>

        <header className="rounded-[2rem] border border-white/[0.08] bg-[#0B1424]/90 p-6 shadow-2xl shadow-black/25 backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-orange-200">
            <FileSearch size={14} /> Nova análise
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Raio-X de Prova</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Informe o cabeçalho, cole o texto da prova no editor rico e mantenha as imagens exatamente onde elas pertencem.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[0.92fr_1.5fr]">
          <section className="rounded-[1.7rem] border border-white/[0.08] bg-[#0B1424]/88 p-5 shadow-xl shadow-black/20">
            <h2 className="text-lg font-black text-white">Cabeçalho da prova</h2>
            <p className="mt-1 text-sm text-slate-400">Esses dados serão salvos para filtros, pesquisas e relatórios futuros.</p>

            <div className="mt-5 space-y-4">
              <EntitySearch
                label="Órgão"
                placeholder="Ex.: PC-MG, IBGE, TJSP"
                apiBase="/api/admin/exam-contests"
                responseKey="contest"
                options={contestOptions}
                search={contestSearch}
                selectedId={contestId}
                selectedName={contestOptions.find(c => c.id === contestId)?.name || ""}
                onSearchChange={(v) => { setContestSearch(v); if (!v.trim()) setContestId(""); }}
                onSelect={(item) => { setContestId(item.id); setContestSearch(item.name); }}
                onCreated={(item) => setContestOptions((curr) => [...curr, item].sort((a, b) => a.name.localeCompare(b.name)))}
              />
              <EntitySearch
                label="Cargo"
                placeholder="Ex.: Técnico Assistente, Analista"
                apiBase="/api/admin/exam-positions"
                responseKey="position"
                options={positionOptions}
                search={positionSearch}
                selectedId={positionId}
                selectedName={positionOptions.find(p => p.id === positionId)?.name || ""}
                onSearchChange={(v) => { setPositionSearch(v); if (!v.trim()) setPositionId(""); }}
                onSelect={(item) => { setPositionId(item.id); setPositionSearch(item.name); }}
                onCreated={(item) => setPositionOptions((curr) => [...curr, item].sort((a, b) => a.name.localeCompare(b.name)))}
              />
              <Input label="Ano" value={examYear} onChange={setExamYear} placeholder="2025" type="number" />
              <BoardSearch
                boards={filteredBoards}
                boardSearch={boardSearch}
                selectedBoardId={boardId}
                selectedBoardName={resolvedBoardName}
                onSearchChange={(value) => { setBoardSearch(value); if (!value.trim()) setBoardId(""); }}
                onSelect={(board) => { setBoardId(board.id); setBoardSearch(board.name); }}
                onCreate={() => { setNewBoardName(boardSearch.trim()); setShowBoardModal(true); }}
              />
              <div className="rounded-2xl border border-orange-300/15 bg-orange-400/10 p-4">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Nome gerado automaticamente</span>
                <p className="break-words text-sm font-black leading-6 text-white">{generatedTitle}</p>
                <p className="mt-2 text-xs leading-5 text-orange-100/70">O nome da análise será criado nesse padrão a partir dos campos informados.</p>
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Disciplina</span>
                <select value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)} className="w-full rounded-2xl border border-white/[0.08] bg-[#091323] px-4 py-3 text-sm font-semibold text-white outline-none focus:border-orange-300/50 focus:ring-4 focus:ring-orange-500/10">
                  {!disciplines.length && <option value="">Informática/TI</option>}
                  {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-sky-300/15 bg-sky-400/10 p-4 text-sm text-sky-100">
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 shrink-0" size={18} />
                <p>Por enquanto o módulo analisará apenas uma disciplina por vez. Questões fora da disciplina selecionada serão ignoradas pela IA.</p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.7rem] border border-white/[0.08] bg-[#0B1424]/88 p-5 shadow-xl shadow-black/20">
            <div>
              <h2 className="text-lg font-black text-white">Texto bruto da prova</h2>
              <p className="mt-1 text-sm text-slate-400">Cole o texto bruto no mesmo padrão do Importador com IA. Depois da análise, as questões serão diagramadas abaixo com o editor completo.</p>
            </div>

            <div className="mt-5">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={`Cole aqui o texto bruto da prova.

Exemplo:
1. Enunciado da questão...
A) Alternativa A
B) Alternativa B
C) Alternativa C
D) Alternativa D
Gabarito: B

Se houver indicação de imagem, mantenha a frase no texto. Depois da diagramação, você cola a imagem no enunciado ou alternativa correspondente.`}
                className="min-h-[28rem] w-full resize-y rounded-2xl border border-white/[0.08] bg-[#07111F]/75 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-orange-300/50 focus:ring-4 focus:ring-orange-500/10"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1"><Bot size={13} /> Mesmo padrão do Importador: texto bruto primeiro, diagramação depois.</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-amber-100">Indicações de imagem serão destacadas com marca-texto.</span>
              </div>
            </div>

            {feedback && (
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${feedback.type === "error" ? "border-red-300/25 bg-red-500/10 text-red-100" : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"}`}>
                {feedback.message}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={handleAnalyze} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                {loading ? "Analisando prova..." : "Analisar com IA"}
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function FieldSearch({ label, value, onChange, placeholder, suggestions }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const term = normalizeComparable(value);
    if (!term) return [];
    return suggestions.filter((s) => normalizeComparable(s).includes(term)).slice(0, 30);
  }, [suggestions, value]);

  return (
    <div className="relative">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#07111F] px-3 py-3">
        <Search size={16} className="shrink-0 text-slate-500" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600"
        />
        {value && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(""); setOpen(false); }} className="text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-[5.5rem] z-30 rounded-2xl border border-white/[0.08] bg-[#0B1424] p-2 shadow-2xl shadow-black/50">
          <div className="max-h-44 space-y-0.5 overflow-auto pr-1">
            {filtered.map((s) => (
              <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(s); setOpen(false); }}
                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EntitySearch({ label, placeholder, apiBase, responseKey, options, search, selectedId, selectedName, onSearchChange, onSelect, onCreated }: {
  label: string; placeholder: string; apiBase: string; responseKey: string;
  options: EntityOption[]; search: string; selectedId: string; selectedName: string;
  onSearchChange: (v: string) => void;
  onSelect: (item: EntityOption) => void;
  onCreated: (item: EntityOption) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = normalizeComparable(search);
    if (!s) return [];
    return options.filter((o) => normalizeComparable(o.name).includes(s)).slice(0, 25);
  }, [options, search]);

  const exactMatch = search.trim() && options.some((o) => normalizeComparable(o.name) === normalizeComparable(search));
  const visible = filtered.filter((o) => o.id !== selectedId);

  async function create() {
    const name = search.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await adminFetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCreateError(data.message || "Erro ao cadastrar. Execute a migration 015 no Supabase.");
        return;
      }
      const item = data[responseKey] as EntityOption;
      if (item) { onCreated(item); onSelect(item); setCreateError(null); }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro de conexão.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#07111F] px-3 py-3">
          <Search size={16} className="shrink-0 text-slate-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600"
          />
          {search && (
            <button type="button" onClick={() => { onSearchChange(""); onSelect({ id: "", name: "" }); }} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        {selectedName && (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100">
            <Check size={13} /> {label} selecionado(a): {selectedName}
          </div>
        )}

        {search.trim() && (visible.length > 0 || !exactMatch) && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2">
            {visible.length > 0 && (
              <div className="max-h-44 space-y-1 overflow-auto pr-1">
                {visible.map((item) => (
                  <button key={item.id} type="button" onClick={() => onSelect(item)}
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-white">
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            {!visible.length && search.trim() && (
              <p className="px-3 py-3 text-sm font-semibold text-slate-400">Nenhum resultado para "{search}".</p>
            )}
            {search.trim() && !exactMatch && (
              <button type="button" onClick={create} disabled={creating}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-300/25 bg-orange-400/10 px-4 py-2.5 text-sm font-black text-orange-100 transition hover:bg-orange-400/15 disabled:opacity-60">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? "Cadastrando..." : `Cadastrar "${search.trim()}"`}
              </button>
            )}
            {createError && (
              <div className="mt-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                {createError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardSearch({ boards, boardSearch, selectedBoardId, selectedBoardName, onSearchChange, onSelect, onCreate }: {
  boards: BoardOption[];
  boardSearch: string;
  selectedBoardId: string;
  selectedBoardName: string;
  onSearchChange: (value: string) => void;
  onSelect: (board: BoardOption) => void;
  onCreate: () => void;
}) {
  const exactMatch = boardSearch.trim() && boards.some((board) => normalizeComparable(board.name) === normalizeComparable(boardSearch));
  const visibleBoards = boards.filter((board) => board.id !== selectedBoardId);

  return (
    <div>
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Banca</span>
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#07111F] px-3 py-3">
          <Search size={16} className="text-slate-500" />
          <input value={boardSearch} onChange={(event) => onSearchChange(event.target.value)} placeholder="Pesquise uma banca cadastrada" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600" />
        </div>

        {selectedBoardName && (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100">
            <Check size={13} /> Banca selecionada: {selectedBoardName}
          </div>
        )}

        {boardSearch.trim() && (visibleBoards.length > 0 || !exactMatch) && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2">
            {visibleBoards.length > 0 && (
              <div className="max-h-44 space-y-1 overflow-auto pr-1">
                {visibleBoards.map((board) => (
                  <button key={board.id} type="button" onClick={() => onSelect(board)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-white">
                    <span>{board.name}</span>
                  </button>
                ))}
              </div>
            )}

            {!visibleBoards.length && boardSearch.trim() && (
              <div className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-400">
                Nenhuma banca encontrada para essa busca.
              </div>
            )}

            {boardSearch.trim() && !exactMatch && (
              <button type="button" onClick={onCreate} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-300/25 bg-orange-400/10 px-4 py-2.5 text-sm font-black text-orange-100 transition hover:bg-orange-400/15">
                <Plus size={16} /> Cadastrar “{boardSearch.trim()}” como nova banca
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", onKeyDown }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-orange-300/50 focus:ring-4 focus:ring-orange-500/10" />
    </label>
  );
}
