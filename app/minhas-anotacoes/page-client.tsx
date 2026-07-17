"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Monitor,
  Save,
} from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";
import { useAuth } from "@/app/contexts/AuthContext";
import StudentNotebookEditor from "@/app/components/student/StudentNotebookEditor";

type NoteApiRow = {
  simulado_id: string;
  simulado_title: string;
  simulado_description: string | null;
  jornadas?: Array<{ id: string; jornada_id: string; title: string }> | null;
  content: string;
};

type Tab = {
  simulado_id: string;
  title: string;
  description: string | null;
  jornada: { id: string; title: string } | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function countAnotacoes(html: string) {
  const clean = String(html || "")
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = clean
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  return decoded
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export default function MinhasAnotacoesClient() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [contentBySimulado, setContentBySimulado] = useState<Record<string, string>>({});
  const [savedContentBySimulado, setSavedContentBySimulado] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const dirtyRef = useRef(false);

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return null;
    }

    return session.access_token;
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) return;

    const res = await fetch("/api/student/notes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      setError(json.message || "Não foi possível carregar suas anotações.");
      setLoading(false);
      return;
    }

    const rows = (json.notes || []) as NoteApiRow[];
    const nextTabs = rows.map((row) => {
      const firstJornada = (row.jornadas || [])[0] || null;
      return {
        simulado_id: row.simulado_id,
        title: row.simulado_title,
        description: row.simulado_description,
        jornada: firstJornada ? { id: firstJornada.jornada_id, title: firstJornada.title } : null,
      };
    });
    const nextContent: Record<string, string> = {};
    rows.forEach((row) => {
      nextContent[row.simulado_id] = row.content;
    });

    setTabs(nextTabs);
    setContentBySimulado(nextContent);
    setSavedContentBySimulado(nextContent);
    setActiveId(nextTabs[0]?.simulado_id ?? null);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (simuladoId: string, content: string) => {
      setSaveStatus("saving");

      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/student/simulados/${simuladoId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        setSaveStatus("error");
        return;
      }

      setSavedContentBySimulado((current) => ({ ...current, [simuladoId]: content }));
      setSaveStatus("saved");
    },
    [getToken],
  );

  function handleContentChange(newHtml: string) {
    const id = activeId;
    if (!id) return;

    // Sem autosave: só atualiza o conteúdo local. A gravação só acontece
    // quando o aluno clica em "Salvar alterações" (ver saveNow).
    setContentBySimulado((current) => ({ ...current, [id]: newHtml }));
  }

  function switchTab(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setSaveStatus("idle");
  }

  async function saveNow() {
    if (!activeId) return;
    await persist(activeId, contentBySimulado[activeId] ?? "");
  }

  // Gera o PDF premium com TODAS as anotações da tela (não só a aba ativa),
  // agrupadas por Jornada e por simulado, usando o conteúdo atual do editor.
  async function handleDownloadPdf() {
    if (isGeneratingPdf || tabs.length === 0) return;
    setIsGeneratingPdf(true);
    setPdfError(null);

    try {
      const { downloadStudentNotesPdf } = await import("@/app/lib/pdf/student-notes-pdf");
      await downloadStudentNotesPdf({
        student: {
          name: profile?.full_name ?? null,
          email: user?.email ?? null,
        },
        simulados: tabs.map((tab) => ({
          simulado_id: tab.simulado_id,
          title: tab.title,
          jornada: tab.jornada,
          content: contentBySimulado[tab.simulado_id] ?? "",
        })),
      });
    } catch (pdfGenerationError) {
      console.error("Erro ao gerar PDF das anotações", pdfGenerationError);
      setPdfError("Não foi possível gerar o PDF agora. Tente novamente.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  const hasAnyUnsavedChanges = tabs.some(
    (tab) => (contentBySimulado[tab.simulado_id] ?? "") !== (savedContentBySimulado[tab.simulado_id] ?? ""),
  );

  useEffect(() => {
    dirtyRef.current = hasAnyUnsavedChanges;
  }, [hasAnyUnsavedChanges]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const activeTab = tabs.find((tab) => tab.simulado_id === activeId) || null;
  const activeContent = activeId ? contentBySimulado[activeId] ?? "" : "";
  const isDirty = activeId ? activeContent !== (savedContentBySimulado[activeId] ?? "") : false;

  return (
    <div
      className="min-h-full px-5 py-7 md:px-8 lg:px-10"
      style={{
        background:
          "radial-gradient(circle at 74% 4%, rgba(255,138,0,0.055), transparent 24%), radial-gradient(circle at 18% 12%, rgba(255,138,0,0.040), transparent 26%), linear-gradient(180deg, #FFFDF9 0%, #FBF8F3 42%, #FFFFFF 100%)",
      }}
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 py-2">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#FF5A00]">ÁREA DO ALUNO</p>
            <h1 className="mt-2.5 text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] text-[#07111F] md:text-[42px] md:leading-[48px]">
              Minhas Anotações
            </h1>
            <p className="mt-2.5 text-base leading-6 text-[#526179]">Revise todas as suas anotações organizadas por simulado.</p>
          </div>

          <Link
            href="/meus-simulados"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-[14px] border border-[#D9E1EC] bg-white px-[22px] text-sm font-bold text-[#0F172A] transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <ArrowLeft size={18} /> Voltar aos simulados
          </Link>
        </header>

        {loading ? (
          <div className="rounded-[18px] border border-[#E5E9F0] bg-white p-10 text-center text-sm text-[#526179] shadow-sm">
            Carregando suas anotações...
          </div>
        ) : error ? (
          <div className="rounded-[18px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
        ) : tabs.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[#D9E1EC] bg-white p-12 text-center shadow-sm">
            <ClipboardList className="mx-auto text-[#FF6A00]" size={40} />
            <h2 className="mt-4 text-lg font-bold text-[#07111F]">Você ainda não possui anotações.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#526179]">
              Abra um simulado, clique em <strong>Caderno</strong> e comece a escrever. Suas anotações aparecerão aqui, organizadas por simulado.
            </p>
            <Link
              href="/meus-simulados"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#FFA048_0%,#FE7C00_55%,#FF5700_100%)] px-6 text-sm font-bold text-white"
            >
              Abrir simulado
            </Link>
          </div>
        ) : (
          <div>
            <div className="mt-1 flex h-16 items-end gap-0 overflow-x-auto" role="tablist">
              {tabs.map((tab) => {
                const active = tab.simulado_id === activeId;
                return (
                  <div
                    key={tab.simulado_id}
                    role="tab"
                    tabIndex={0}
                    aria-selected={active}
                    onClick={() => switchTab(tab.simulado_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        switchTab(tab.simulado_id);
                      }
                    }}
                    className={
                      active
                        ? "relative z-10 flex h-16 min-w-[240px] max-w-[320px] shrink-0 cursor-pointer items-center gap-3 rounded-t-2xl px-6 text-[16px] font-extrabold tracking-[-0.015em] text-white shadow-[0_14px_28px_rgba(255,106,0,0.24)]"
                        : "flex h-[60px] min-w-[220px] max-w-[320px] shrink-0 cursor-pointer items-center gap-3 rounded-t-2xl border border-b-0 border-[#E1E6EF] bg-white/[0.86] px-6 text-[16px] font-semibold text-[#334155] backdrop-blur-sm transition hover:-translate-y-px hover:border-[#D8E0EA] hover:bg-white"
                    }
                    style={
                      active
                        ? { background: "linear-gradient(135deg, #FF8A00 0%, #FF6A00 45%, #FF3D00 100%)" }
                        : undefined
                    }
                  >
                    <ClipboardList size={active ? 22 : 21} strokeWidth={2.2} className={active ? "shrink-0" : "shrink-0 text-[#0F172A]"} />
                    <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
                  </div>
                );
              })}
            </div>

            {activeTab && (
              <article
                role="tabpanel"
                className="rounded-[0_18px_18px_18px] border border-[#E5E9F0] bg-white/[0.92] shadow-[0_24px_60px_rgba(15,23,42,0.08)]"
                style={{ borderRadius: "0 18px 18px 18px" }}
              >
                <header className="flex min-h-[126px] flex-col gap-4 px-9 py-8 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#FF8A00_0%,#FF3D00_100%)] text-white shadow-[0_10px_24px_rgba(255,90,0,0.28)]">
                      <Monitor size={26} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-extrabold text-[#07111F]">{activeTab.title}</h2>
                      {activeTab.description && (
                        <p className="mt-1 max-w-[760px] text-[15px] leading-[22px] text-[#526179]">{activeTab.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="flex h-[72px] w-[86px] flex-col items-center justify-center rounded-2xl bg-[#F8F4EF]">
                      <strong className="text-[22px] font-extrabold text-[#07111F]">{countAnotacoes(activeContent)}</strong>
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#526179]">Anotações</span>
                    </div>

                    <span aria-hidden className="h-14 w-px bg-[#E5E7EB]" />

                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={isGeneratingPdf}
                        title="Baixar PDF com todas as suas anotações, organizadas por Jornada e simulado"
                        className="inline-flex h-12 items-center gap-2 rounded-[14px] border border-[rgba(255,90,0,0.35)] bg-[#FFF7F1] px-[22px] text-sm font-extrabold text-[#F45100] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isGeneratingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                        {isGeneratingPdf ? "Gerando PDF..." : "PDF"}
                      </button>
                      {pdfError && <span className="text-xs font-bold text-red-600">{pdfError}</span>}
                    </div>
                  </div>
                </header>

                <div className="mx-9 mb-6">
                  <StudentNotebookEditor
                    key={activeTab.simulado_id}
                    value={activeContent}
                    onChange={handleContentChange}
                    placeholder="Comece a escrever suas anotações aqui..."
                    ariaLabel={`Editor de anotações do simulado ${activeTab.title}`}
                  />
                </div>

                <div className="flex flex-col items-center gap-3 pb-8 text-center text-sm font-semibold" aria-live="polite">
                  {saveStatus === "saving" && (
                    <span className="inline-flex items-center gap-2 text-[#526179]">
                      <Loader2 size={15} className="animate-spin" /> Salvando alterações...
                    </span>
                  )}
                  {saveStatus === "error" && (
                    <span className="inline-flex items-center gap-2 text-[#EF4444]">
                      <AlertCircle size={15} /> Não foi possível salvar.
                      <button
                        type="button"
                        onClick={saveNow}
                        className="ml-1 rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        Tentar novamente
                      </button>
                    </span>
                  )}
                  {saveStatus !== "saving" && saveStatus !== "error" && isDirty && (
                    <button
                      type="button"
                      onClick={saveNow}
                      className="animate-pulse inline-flex h-11 items-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#FFA048_0%,#FE7C00_55%,#FF5700_100%)] px-6 text-sm font-bold text-white shadow-[0_0_0_3px_rgba(255,87,0,0.18)] transition hover:-translate-y-0.5"
                    >
                      <Save size={16} /> Salvar alterações
                    </button>
                  )}
                  {saveStatus !== "saving" && saveStatus !== "error" && !isDirty && (
                    <span className="inline-flex items-center gap-2 text-[#10B981]">
                      <CheckCircle2 size={15} /> Todas as alterações foram salvas
                    </span>
                  )}
                </div>
              </article>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
