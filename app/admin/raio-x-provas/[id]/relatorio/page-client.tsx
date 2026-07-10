"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { adminFetch } from "@/lib/supabase/adminFetch";

const HERO_BG = "/images/raio-x/bg-simulados1.png";
const SECTION_BLUE_BG = "/images/raio-x/bg-simulados2.png";
const SECTION_ORANGE_BG = "/images/raio-x/bg-simulados3.png";
const COLORS = ["#f97316", "#38bdf8", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444"];

type ModuleSummary = {
  module: string;
  question_count: number;
  percentage?: number;
  average_difficulty?: number | null;
  knowledge_points?: string[];
  tags?: string[];
  question_numbers?: string[];
};

type ReportQuestion = {
  id: string;
  original_number?: string | null;
  statement?: string | null;
  alternatives?: Array<{ label?: string; text?: string; is_correct?: boolean }> | null;
  answer_key?: string | null;
  is_annulled?: boolean | null;
  module_name?: string | null;
  subject_name?: string | null;
  subtopic_name?: string | null;
  difficulty_level?: number | null;
  knowledge_points?: string[] | null;
  tags?: string[] | null;
  has_image?: boolean | null;
  charging_profile?: string | null;
  explanation_text?: string | null;
  teacher_opinion?: string | null;
};

type Props = {
  analysis: any;
  effectiveModules?: ModuleSummary[];
  totalQuestions?: number;
  withImage?: number;
  avgDiff?: number;
  questions?: ReportQuestion[];
};

function cleanText(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBlockText(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampText(value: string, max = 220) {
  const clean = cleanText(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

function difficultyLabel(value?: number | null) {
  const n = Number(value || 0);
  if (!n) return "Não informada";
  if (n < 2.5) return "Moderada";
  if (n < 3.6) return "Moderada";
  return "Difícil";
}

function difficultyTone(value?: number | null) {
  const n = Number(value || 0);
  if (!n) return "#94a3b8";
  if (n < 2.5) return "#38bdf8";
  if (n < 3.6) return "#22c55e";
  return "#fb923c";
}

function safeFileName(value: string) {
  return (value || "RaioX")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\-_]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function unique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw || "");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}


function getQuestionTags(question: ReportQuestion) {
  return unique([
    question.subject_name,
    question.module_name,
    question.subtopic_name,
    ...(question.tags || []),
    ...(question.knowledge_points || []),
  ]);
}

function moduleTags(module: ModuleSummary, questions: ReportQuestion[]) {
  const moduleKey = cleanText(module.module).toLowerCase();
  const related = questions.filter((q) => {
    const names = [q.subject_name, q.module_name].map((v) => cleanText(v).toLowerCase());
    return names.includes(moduleKey);
  });
  return unique([
    module.module,
    ...(module.tags || []),
    ...(module.knowledge_points || []),
    ...related.flatMap((q) => getQuestionTags(q)),
  ]).filter((tag) => tag.toLowerCase() !== moduleKey);
}

function parecerText(value: string | null | undefined, analysis: any, fallback: string) {
  const raw = cleanBlockText(value || analysis.final_summary_text || analysis.teacher_notes || analysis.summary_text || fallback);
  if (!raw) return fallback;
  return raw;
}

function paragraphList(value: string) {
  const source = cleanBlockText(value);
  const paragraphs = source
    .split(/\n\s*\n+/)
    .map((p) => cleanText(p))
    .filter(Boolean);
  return paragraphs.length ? paragraphs : [cleanText(value)];
}

function computeDominance(modules: ModuleSummary[], total: number) {
  const sorted = [...modules].sort((a, b) => Number(b.question_count || 0) - Number(a.question_count || 0));
  const topCount = Number(sorted[0]?.question_count || 0);
  const tied = sorted.filter((m) => Number(m.question_count || 0) === topCount && topCount > 0);
  const pct = total > 0 && topCount > 0 ? Math.round((topCount / total) * 100) : 0;
  const hasDominant = tied.length === 1 && topCount > Number(sorted[1]?.question_count || 0);
  return { sorted, topCount, tied, pct, hasDominant };
}

function SectionTitle({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="rx-section-title">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function TagList({ tags, limit = 6 }: { tags?: string[] | null; limit?: number }) {
  const clean = unique(tags || []).slice(0, limit);
  if (!clean.length) return null;
  return (
    <div className="rx-tags">
      {clean.map((tag) => <span key={tag}>{tag}</span>)}
    </div>
  );
}

function TopicTagList({ tags, limit = 18 }: { tags?: string[] | null; limit?: number }) {
  const clean = unique(tags || []).slice(0, limit);
  if (!clean.length) return null;
  return (
    <ul className="rx-topic-tags">
      {clean.map((tag) => (
        <li key={tag}>
          <span aria-hidden="true">→</span>
          <strong>{tag}</strong>
        </li>
      ))}
    </ul>
  );
}

function MiniLogo() {
  return (
    <div className="rx-logo">
      <div className="rx-logo-mark">◉</div>
      <div>
        <strong>ESTUDO<span>TOP</span></strong>
        <small>SIMULADOS</small>
      </div>
    </div>
  );
}

export default function RelatorioClient({ analysis, effectiveModules = [], totalQuestions, withImage, avgDiff, questions = [] }: Props) {
  const router = useRouter();
  const rawContent = analysis.final_summary_text || analysis.summary_text || "";
  const [content, setContent] = useState(rawContent);
  const [editMode, setEditMode] = useState(false);
  const [parecerDraft, setParecerDraft] = useState(cleanBlockText(rawContent || analysis.teacher_notes || ""));
  const [editingParecer, setEditingParecer] = useState(false);
  const [savingParecer, setSavingParecer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const modules = useMemo(() => [...effectiveModules].sort((a, b) => Number(b.question_count || 0) - Number(a.question_count || 0)), [effectiveModules]);
  const total = Number(totalQuestions ?? analysis.dashboard?.total_it_questions ?? modules.reduce((s, m) => s + Number(m.question_count || 0), 0));
  const annulledCount = questions.filter((q) => q.is_annulled).length;
  const averageDifficulty = Number(avgDiff ?? analysis.dashboard?.average_difficulty ?? 0);
  const dominance = computeDominance(modules, total);
  const hasContent = Boolean(String(content || "").trim());
  const generatedAt = analysis.updated_at ? new Date(analysis.updated_at).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
  const finalPlain = cleanText(content);

  const distributionLabel = dominance.hasDominant ? "Concentrada" : "Equilibrada";
  const distributionText = dominance.hasDominant
    ? `Maior peso em ${dominance.tied[0]?.module || "um assunto"}`
    : `${dominance.tied.length || modules.length} assuntos com peso semelhante`;
  const quickRead = dominance.hasDominant
    ? `A prova concentrou ${dominance.pct}% da cobrança em ${dominance.tied[0]?.module}. Os demais assuntos tiveram participação menor no recorte de Informática.`
    : `A prova apresentou distribuição equilibrada: ${dominance.tied.length || modules.length} assuntos ficaram com o mesmo peso quantitativo, representando ${dominance.pct || 0}% da cobrança cada. Portanto, não houve predominância estatística isolada.`;
  const hardest = [...modules].filter((m) => m.average_difficulty != null).sort((a, b) => Number(b.average_difficulty || 0) - Number(a.average_difficulty || 0)).slice(0, 2);
  const easiest = [...modules].filter((m) => m.average_difficulty != null).sort((a, b) => Number(a.average_difficulty || 0) - Number(b.average_difficulty || 0)).slice(0, 2);
  const allTags = unique([
    ...modules.flatMap((m) => [...(m.tags || []), ...(m.knowledge_points || [])]),
    ...questions.flatMap((q) => getQuestionTags(q)),
  ]);
  const parecer = parecerText(parecerDraft || content, analysis, "Para esse perfil de prova, o aluno deve estudar com equilíbrio, reforçar os assuntos de maior dificuldade e treinar questões objetivas com regularidade.");

  async function saveParecer() {
    const text = parecerDraft.trim();
    if (!text) {
      setFeedback("Preencha o Parecer EstudoTOP antes de salvar.");
      return;
    }
    setSavingParecer(true);
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_notes: text, final_summary_text: text, summary_text: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao salvar parecer.");
      setContent(text);
      setEditingParecer(false);
      setFeedback("Parecer EstudoTOP salvo com sucesso.");
      setTimeout(() => setFeedback(null), 3000);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro ao salvar parecer.");
    } finally {
      setSavingParecer(false);
    }
  }


  async function saveContent() {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/exam-analyses/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_summary_text: content, summary_text: content }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Erro ao salvar.");
      setEditMode(false);
      setParecerDraft(content);
      setFeedback("Relatório salvo com sucesso.");
      setTimeout(() => setFeedback(null), 3000);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }


  async function copyContent() {
    const publicUrl = typeof window !== "undefined" ? window.location.href : "";
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setFeedback("Link do relatório copiado para a área de transferência.");
    setTimeout(() => {
      setCopied(false);
      setFeedback(null);
    }, 2600);
  }

  return (
    <main className="rx-page">
      <style>{STYLES}</style>

      <header className="rx-adminbar no-print">
        <Link href={`/admin/raio-x-provas/${analysis.id}`} className="rx-admin-button rx-admin-secondary"><ArrowLeft size={15} /> Voltar</Link>
        <div className="rx-admin-title">
          <strong>{analysis.title}</strong>
        </div>
        <div className="rx-admin-actions">
          {hasContent && !editMode ? (
            <>
              <button type="button" onClick={copyContent} className="rx-admin-button rx-admin-secondary"><Copy size={14} /> {copied ? "Link copiado" : "Copiar link"}</button>
              <button type="button" onClick={() => setEditingParecer(true)} className="rx-admin-button rx-admin-secondary"><Save size={14} /> Editar parecer</button>
            </>
          ) : null}
          {editMode ? (
            <>
              <button type="button" onClick={() => setEditMode(false)} className="rx-admin-button rx-admin-secondary">Visualizar</button>
              <button type="button" onClick={saveContent} disabled={saving} className="rx-admin-button rx-admin-primary">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar</button>
            </>
          ) : null}
        </div>
      </header>

      {feedback ? <div className="rx-feedback no-print">{feedback}</div> : null}

      {editMode ? (
        <section className="rx-editor no-print">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
        </section>
      ) : (
        <div id="report-document" className="rx-document">
          <section className="rx-hero rx-break-avoid">
            <div className="rx-hero-bg" />
            <div className="rx-hero-content">
              <MiniLogo />
              <h1><span>RAIO-X DE</span><strong>PROVAS</strong></h1>
              <h3>Análise estratégica da prova de Informática</h3>
              <p className="rx-hero-sub">{analysis.contest_name} — {analysis.position_name} — {analysis.board_name}</p>
              <p className="rx-hero-text">Um relatório completo e objetivo para entender como a banca cobrou cada assunto e direcionar seus estudos com precisão.</p>
              <div className="rx-hero-badges">
                <span><ShieldCheck size={18} /> Análise completa</span>
                <span><BarChart3 size={18} /> Dados confiáveis</span>
                <span><Sparkles size={18} /> Insights estratégicos</span>
                <span><Star size={18} /> Foco na aprovação</span>
              </div>
            </div>
          </section>

          <section className="rx-kpis rx-break-avoid">
            <div className="rx-kpi-card"><FileText size={28} /><strong>{total}</strong><span>Questões de Informática</span></div>
            <div className="rx-kpi-card"><Layers3 size={28} /><strong>{modules.length}</strong><span>Assuntos abordados</span></div>
            <div className="rx-kpi-card"><Target size={28} /><strong>{averageDifficulty ? averageDifficulty.toFixed(1) : "—"} / 5</strong><span>Dificuldade média</span></div>
            <div className="rx-kpi-card"><ClipboardList size={28} /><strong>{annulledCount}</strong><span>Questões anuladas</span></div>
          </section>

          <section className="rx-panel rx-panel-map rx-break-avoid">
            <SectionTitle number="01" title="Assuntos cobrados na prova" subtitle="Distribuição visual dos assuntos cobrados na prova." />
            <div className="rx-subject-grid">
              {modules.map((mod, index) => {
                const pct = total > 0 ? Math.round((Number(mod.question_count || 0) / total) * 100) : Number(mod.percentage || 0);
                const color = COLORS[index % COLORS.length];
                return (
                  <article className="rx-subject-card" key={mod.module} style={{ ["--accent" as any]: color }}>
                    <div className="rx-subject-top">
                      <span className="rx-rank">{String(index + 1).padStart(2, "0")}</span>
                      <div className="rx-subject-icon"><BookOpen size={26} /></div>
                    </div>
                    <h3>{mod.module}</h3>
                    <div className="rx-subject-meta">
                      <span className="rx-subject-count">{mod.question_count} {Number(mod.question_count) !== 1 ? "questões" : "questão"}</span>
                      <span className="rx-subject-percent">{pct}% da prova</span>
                    </div>
                    <div className="rx-diff-pill">{Number(mod.average_difficulty || 0).toFixed(1)} / 5</div>
                    <p className="rx-diff-label">{difficultyLabel(mod.average_difficulty)}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rx-panel rx-panel-blue rx-break-avoid">
            <SectionTitle number="02" title="Perfil da prova" subtitle="Indicadores principais do comportamento da cobrança." />
            <div className="rx-profile-grid">
              <div className="rx-profile-card"><BarChart3 size={38} /><small>Distribuição</small><strong>{distributionLabel}</strong><p>{distributionText}</p></div>
              <div className="rx-profile-card"><Target size={38} /><small>Dificuldade geral</small><strong>{difficultyLabel(averageDifficulty)}</strong><p>Média {averageDifficulty ? averageDifficulty.toFixed(1) : "—"}/5</p></div>
              <div className="rx-profile-card"><Layers3 size={38} /><small>Diversidade temática</small><strong>{modules.length >= 5 ? "Alta" : modules.length >= 3 ? "Média" : "Baixa"}</strong><p>{modules.length} assuntos mapeados</p></div>
              <div className="rx-profile-card"><ClipboardList size={38} /><small>Nível de exigência</small><strong>{averageDifficulty >= 3.8 ? "Elevado" : averageDifficulty >= 2.4 ? "Intermediário" : "Básico"}</strong><p>{averageDifficulty >= 3.8 ? "Exige domínio técnico mais firme" : averageDifficulty >= 2.4 ? "Exige atenção aos fundamentos" : "Cobrança de base conceitual"}</p></div>
            </div>
            <div className="rx-reading-box">
              <Star size={28} />
              <div>
                <h3>Leitura rápida</h3>
                <p>{quickRead}</p>
                {allTags.length ? <TagList tags={allTags} limit={12} /> : null}
              </div>
            </div>
          </section>

          <section className="rx-panel rx-panel-orange rx-break-avoid">
            <SectionTitle number="03" title="O que foi cobrado dentro de cada assunto" subtitle="Tags consolidadas a partir da classificação da IA, dos tópicos revisados e dos ajustes feitos pelo professor." />
            <div className="rx-topic-map">
              {modules.map((mod, index) => {
                const color = COLORS[index % COLORS.length];
                const tags = moduleTags(mod, questions);
                const relatedNumbers = unique([...(mod.question_numbers || []), ...questions.filter((q) => cleanText(q.subject_name || q.module_name).toLowerCase() === cleanText(mod.module).toLowerCase()).map((q, i) => q.original_number || String(i + 1))]);
                return (
                  <article className="rx-topic-card" key={mod.module} style={{ ["--accent" as any]: color }}>
                    <div className="rx-topic-head">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{mod.module}</h3>
                        <p>{mod.question_count} {Number(mod.question_count) !== 1 ? "questões" : "questão"}{relatedNumbers.length ? ` · Questões ${relatedNumbers.join(", ")}` : ""}</p>
                      </div>
                    </div>
                    {tags.length ? <TopicTagList tags={tags} limit={18} /> : <p className="rx-empty">Nenhuma tag específica informada para este assunto.</p>}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rx-panel rx-panel-parecer rx-break-avoid">
            <SectionTitle number="04" title="Parecer EstudoTOP" />
            <div className="rx-parecer">
              <div className="rx-parecer-symbol">◎</div>
              <div className="rx-parecer-text">
                {!editingParecer ? (
                  <>
                    <div className="rx-parecer-paragraphs">
                      {paragraphList(parecer).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                    </div>
                    <button type="button" onClick={() => setEditingParecer(true)} className="rx-inline-edit no-print"><Save size={15} /> Editar parecer</button>
                  </>
                ) : (
                  <div className="rx-parecer-editor no-print">
                    <p>Revise o texto final do Parecer EstudoTOP. O que for salvo aqui será usado na tela e no PDF.</p>
                    <textarea value={parecerDraft} onChange={(e) => setParecerDraft(e.target.value)} />
                    <div className="rx-parecer-editor-actions">
                      <button type="button" onClick={() => { setParecerDraft(parecer); setEditingParecer(false); }} className="rx-admin-button rx-admin-secondary">Cancelar</button>
                      <button type="button" onClick={saveParecer} disabled={savingParecer} className="rx-admin-button rx-admin-primary">{savingParecer ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar parecer</button>
                    </div>
                  </div>
                )}
                <div className="rx-parecer-steps">
                  <span><BookOpen size={26} /> Estude com estratégia</span>
                  <span><BarChart3 size={26} /> Treine mais questões</span>
                  <span><Award size={26} /> Revise e consolide</span>
                  <span><Trophy size={26} /> Prepare-se completo</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rx-panel rx-panel-blue">
            <SectionTitle number="05" title="Lista de questões da prova" subtitle="Visão final das questões analisadas, com assunto, tags, dificuldade, imagem e gabarito sugerido." />
            <div className="rx-question-list">
              {questions.map((q, index) => {
                const number = q.original_number || String(index + 1);
                const tags = getQuestionTags(q);
                const diff = Number(q.difficulty_level || 0);
                const correct = q.is_annulled ? "Anulada" : q.answer_key || q.alternatives?.find((a) => a.is_correct)?.label || "—";
                const alternatives = Array.isArray(q.alternatives) ? q.alternatives : [];
                return (
                  <article className={`rx-question-card ${q.is_annulled ? "rx-question-annulled" : ""}`} key={q.id}>
                    {q.is_annulled ? <div className="rx-annulled-watermark">ANULADA</div> : null}
                    <div className="rx-question-head">
                      <span className="rx-question-number">Q{String(number).padStart(2, "0")}</span>
                      <div>
                        <h3>{q.subject_name || q.module_name || "Assunto não classificado"}</h3>
                        <TagList tags={tags} limit={8} />
                      </div>
                      <div className="rx-question-status">
                        <span style={{ color: difficultyTone(diff) }}>{diff ? `${diff.toFixed(1)} / 5` : "—"}</span>
                        <small>{difficultyLabel(diff)}</small>
                      </div>
                    </div>
                    <p className="rx-question-statement">{cleanText(q.statement || "Enunciado não disponível.")}</p>
                    {alternatives.length ? (
                      <div className="rx-alternatives">
                        {alternatives.map((alt, altIndex) => {
                          const label = alt.label || String.fromCharCode(65 + altIndex);
                          const isCorrect = !q.is_annulled && (alt.is_correct || label === q.answer_key);
                          return (
                            <div className={`rx-alternative ${isCorrect ? "correct" : ""}`} key={`${q.id}-${label}-${altIndex}`}>
                              <span>{label}</span>
                              <p>{cleanText(alt.text || "Alternativa sem texto.")}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="rx-question-foot">
                      <span><CheckCircle2 size={15} /> Gabarito: <strong>{correct}</strong></span>
                      {q.has_image ? <span><ImageIcon size={15} /> Com imagem</span> : null}
                    </div>
                  </article>
                );
              })}
              {!questions.length ? <p className="rx-empty">Nenhuma questão disponível para listar neste relatório.</p> : null}
            </div>
          </section>

          <section className="rx-final-premium rx-break-avoid">
            <div className="rx-final-visual" aria-hidden="true">
              <div className="rx-final-owl" />
              <div className="rx-final-glow" />
            </div>
            <div className="rx-final-copy">
              <h2>Informação é poder. Estratégia é aprovação.</h2>
              <p>
                O Raio-X transforma a prova em direção: mostra onde a banca concentrou a cobrança,
                revela os pontos de atenção e entrega ao aluno um caminho mais inteligente para revisar.
              </p>
              <div className="rx-final-pillars">
                <span><BookOpen size={20} /> Estude com foco</span>
                <span><BarChart3 size={20} /> Leia os dados</span>
                <span><Target size={20} /> Treine com estratégia</span>
                <span><Award size={20} /> Busque evolução</span>
              </div>
              <small>EstudoTOP Simulados — relatório gerado em {generatedAt}</small>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const STYLES = `
  .rx-page { min-height: 100vh; background: #030b16; color: #e5eefb; font-family: Arial, Helvetica, sans-serif; }
  .rx-adminbar { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 14px; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(3,8,15,.92); backdrop-filter: blur(16px); }
  .rx-admin-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .rx-admin-title strong { color: #e5eefb; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rx-admin-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .rx-admin-button { display: inline-flex; align-items: center; gap: 7px; border-radius: 12px; padding: 8px 13px; font-size: 12px; font-weight: 900; cursor: pointer; text-decoration: none; border: 1px solid rgba(255,255,255,.12); }
  .rx-admin-secondary { background: rgba(255,255,255,.04); color: #cbd5e1; }
  .rx-admin-primary { background: linear-gradient(135deg,#f97316,#f59e0b); color: #07111f; border-color: #f59e0b; }
  .rx-feedback { max-width: 1180px; margin: 12px auto 0; border: 1px solid rgba(249,115,22,.25); background: rgba(249,115,22,.08); color: #fed7aa; border-radius: 14px; padding: 12px 16px; font-size: 13px; font-weight: 800; }
  .rx-editor { max-width: 1120px; margin: 24px auto; padding: 0 24px; }
  .rx-editor textarea { width: 100%; min-height: 72vh; border: 1px solid rgba(255,255,255,.12); border-radius: 24px; background: #07111f; color: #dbeafe; padding: 24px; font: 14px/1.7 monospace; outline: none; }

  .rx-document { max-width: 1280px; margin: 0 auto 40px; background: #050e1a; border: 1px solid rgba(148,163,184,.26); border-radius: 20px; box-shadow: 0 26px 120px rgba(0,0,0,.58); overflow: hidden; position: relative; }
  .rx-document::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 85% 16%, rgba(249,115,22,.12), transparent 22%), radial-gradient(circle at 15% 45%, rgba(14,165,233,.08), transparent 24%); z-index: 0; }
  .rx-document > section { position: relative; z-index: 1; }

  .rx-hero { position: relative; min-height: 650px; overflow: hidden; background: #06101d; border-bottom: 1px solid rgba(255,255,255,.08); }
  .rx-hero-bg { position: absolute; inset: 0; background-image: linear-gradient(90deg, rgba(4,10,19,.97) 0%, rgba(5,12,23,.9) 31%, rgba(5,12,23,.45) 58%, rgba(5,12,23,.06) 100%), url('${HERO_BG}'); background-size: cover; background-position: center; }
  .rx-hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 190px; background: linear-gradient(180deg, transparent, #050e1a 92%); pointer-events: none; }
  .rx-hero-content { position: relative; z-index: 1; max-width: 590px; padding: 44px 0 52px 64px; }
  .rx-logo { display: inline-flex; align-items: center; gap: 14px; margin-bottom: 96px; }
  .rx-logo-mark { width: 48px; height: 48px; border-radius: 16px; border: 1px solid rgba(249,115,22,.46); display: grid; place-items: center; color: #f59e0b; font-size: 22px; box-shadow: inset 0 0 22px rgba(249,115,22,.13); }
  .rx-logo strong { color: #fff; font-size: 28px; letter-spacing: -.06em; line-height: 1; }
  .rx-logo strong span { color: #f97316; }
  .rx-logo small { display: block; color: #cbd5e1; letter-spacing: .38em; font-size: 10px; font-weight: 900; }
  .rx-hero h1 { margin: 0 0 22px; font-size: 74px; line-height: .93; letter-spacing: -.075em; font-weight: 1000; }
  .rx-hero h1 span { display: block; color: #fff; text-shadow: 0 6px 22px rgba(0,0,0,.38); }
  .rx-hero h1 strong { display: block; color: #f59e0b; text-shadow: 0 8px 30px rgba(249,115,22,.22); }
  .rx-hero h3 { margin: 0 0 16px; color: #fff; font-size: 24px; font-weight: 900; line-height: 1.15; }
  .rx-hero-sub { margin: 0 0 18px; color: #fb923c; font-weight: 900; }
  .rx-hero-text { max-width: 520px; color: #c8d7ef; font-size: 16px; line-height: 1.7; margin-bottom: 30px; }
  .rx-hero-badges { display: flex; flex-wrap: nowrap; width: min(780px, calc(100vw - 80px)); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; overflow: hidden; background: rgba(3,8,15,.54); backdrop-filter: blur(10px); }
  .rx-hero-badges span { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 10px; color: #e2e8f0; font-size: 11px; font-weight: 800; border-right: 1px solid rgba(255,255,255,.08); white-space: normal; line-height: 1.15; text-align: left; }
  .rx-hero-badges svg { color: #f97316; flex: none; }

  .rx-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; padding: 24px 64px 44px; margin-top: -20px; position: relative; z-index: 2; background: linear-gradient(180deg, #050e1a, #050e1a); }
  .rx-kpi-card { min-height: 152px; border-radius: 22px; border: 1px solid rgba(249,115,22,.45); background: rgba(4,12,23,.9); box-shadow: 0 16px 54px rgba(0,0,0,.38), inset 0 0 28px rgba(255,255,255,.025); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; }
  .rx-kpi-card svg { color: #f59e0b; margin-bottom: 14px; }
  .rx-kpi-card strong { color: #fff; font-size: 42px; line-height: 1; margin-bottom: 8px; }
  .rx-kpi-card span { color: #dbeafe; font-size: 16px; line-height: 1.25; }

  .rx-panel { margin: 0 48px 24px; border: 1px solid rgba(255,255,255,.13); border-radius: 18px; padding: 30px; background-color: rgba(4,12,23,.88); background-image: linear-gradient(180deg, rgba(10,24,44,.86), rgba(4,12,23,.92)); background-size: cover; background-position: center; box-shadow: inset 0 0 70px rgba(56,189,248,.045); overflow: hidden; }
  .rx-panel-map, .rx-panel-blue { background-image: linear-gradient(180deg, rgba(7,17,31,.84), rgba(5,14,27,.94)), url('${SECTION_BLUE_BG}'); background-size: cover; background-position: center; }
  .rx-panel-orange, .rx-panel-parecer { background-image: linear-gradient(180deg, rgba(7,17,31,.84), rgba(5,14,27,.94)), url('${SECTION_ORANGE_BG}'); background-size: cover; background-position: center; }
  .rx-section-title { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 26px; }
  .rx-section-title > span { color: #fb923c; font-size: 32px; font-weight: 1000; letter-spacing: -.04em; }
  .rx-section-title h2 { margin: 0; color: #fff; font-size: 31px; line-height: 1.08; letter-spacing: -.045em; text-transform: uppercase; font-weight: 1000; text-shadow: 0 2px 0 rgba(0,0,0,.35); }
  .rx-section-title p { margin: 7px 0 0; color: #c5d5ee; font-size: 14px; }

  .rx-subject-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 210px)); justify-content: center; gap: 18px; }
  .rx-subject-card { border-radius: 18px; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: linear-gradient(145deg, rgba(255,255,255,.058), rgba(255,255,255,.025)); padding: 22px; min-height: 235px; box-shadow: inset 0 0 36px color-mix(in srgb, var(--accent) 10%, transparent), 0 12px 40px rgba(0,0,0,.22); text-align: center; }
  .rx-subject-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .rx-rank { width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); font-weight: 1000; }
  .rx-subject-icon { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 999px; color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent); margin-left: auto; }
  .rx-subject-card h3 { margin: 0 auto 20px; color: #fff; min-height: 50px; font-size: 18px; text-transform: uppercase; line-height: 1.12; font-weight: 1000; }
  .rx-subject-meta { display: grid; grid-template-columns: 1fr; justify-items: center; gap: 4px; color: #dbeafe; font-size: 12px; margin-bottom: 15px; line-height: 1.2; }
  .rx-subject-meta span { display: block; white-space: nowrap; }
  .rx-subject-count { color: #e5eefb; font-weight: 800; }
  .rx-subject-percent { color: #fff; font-weight: 1000; }
  .rx-diff-pill { display: inline-flex; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); border-radius: 999px; padding: 8px 18px; font-size: 18px; font-weight: 1000; margin-bottom: 8px; min-width: 100px; justify-content: center; }
  .rx-diff-label { color: var(--accent); margin: 0; font-size: 12px; font-weight: 900; }
  .rx-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .rx-tags span { border: 1px solid rgba(255,255,255,.11); background: rgba(255,255,255,.055); color: #dbeafe; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-weight: 800; }


  .rx-topic-map { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px; }
  .rx-topic-card { border-radius: 18px; border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent); background: linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.025)); padding: 22px; box-shadow: inset 0 0 34px color-mix(in srgb, var(--accent) 9%, transparent); }
  .rx-topic-head { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px; }
  .rx-topic-head > span { width: 38px; height: 38px; border-radius: 13px; display: grid; place-items: center; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 48%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 1000; }
  .rx-topic-head h3 { margin: 0; color: #fff; text-transform: uppercase; font-size: 18px; line-height: 1.15; }
  .rx-topic-head p { margin: 6px 0 0; color: #c5d5ee; font-size: 12px; font-weight: 700; }
  .rx-topic-tags { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 9px; }
  .rx-topic-tags li { display: flex; align-items: flex-start; gap: 10px; min-width: 0; border-top: 1px solid rgba(255,255,255,.08); padding-top: 9px; color: #dbeafe; font-size: 12px; line-height: 1.45; }
  .rx-topic-tags li:first-child { border-top: 0; padding-top: 0; }
  .rx-topic-tags span { margin-top: 1px; display: grid; height: 20px; width: 20px; flex: 0 0 20px; place-items: center; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent); background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent); font-size: 13px; font-weight: 1000; }
  .rx-topic-tags strong { min-width: 0; color: #edf5ff; font-weight: 850; overflow-wrap: anywhere; }

  .rx-profile-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .rx-profile-card { border: 1px solid rgba(255,255,255,.12); background: rgba(4,14,28,.7); border-radius: 20px; padding: 28px 18px; text-align: center; min-height: 210px; box-shadow: inset 0 0 34px rgba(255,255,255,.025); }
  .rx-profile-card svg { color: #f59e0b; margin-bottom: 20px; }
  .rx-profile-card small { display: block; color: #cbd5e1; text-transform: uppercase; letter-spacing: .16em; font-size: 10px; font-weight: 900; }
  .rx-profile-card strong { display: block; color: #fff; font-size: 23px; margin: 14px 0; line-height: 1.12; }
  .rx-profile-card p { color: #c5d5ee; margin: 0; font-size: 13px; line-height: 1.45; }
  .rx-reading-box, .rx-recommendation { margin-top: 24px; border: 1px solid rgba(249,115,22,.38); background: linear-gradient(90deg, rgba(249,115,22,.12), rgba(255,255,255,.025)); border-radius: 18px; padding: 24px; display: flex; gap: 18px; align-items: flex-start; }
  .rx-reading-box svg, .rx-recommendation svg { color: #f59e0b; flex: none; }
  .rx-reading-box h3 { margin: 0 0 10px; color: #fb923c; font-size: 22px; text-transform: uppercase; }
  .rx-reading-box p, .rx-recommendation p { margin: 0; color: #e5eefb; font-size: 16px; line-height: 1.65; }

  .rx-conclusion-grid { display: grid; grid-template-columns: .92fr 1.08fr; gap: 18px; }
  .rx-text-card { border-radius: 18px; padding: 24px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); }
  .rx-text-card h3 { display: flex; gap: 10px; align-items: center; margin: 0 0 18px; color: #38bdf8; text-transform: uppercase; }
  .rx-text-card.orange h3 { color: #fb923c; }
  .rx-text-card p, .rx-text-card li { color: #e5eefb; font-size: 15px; line-height: 1.65; }
  .rx-text-card ol { margin: 0; padding-left: 22px; }
  .rx-parecer { display: grid; grid-template-columns: 260px 1fr; gap: 26px; align-items: center; }
  .rx-parecer-symbol { min-height: 220px; border-radius: 18px; display: grid; place-items: center; color: #f59e0b; font-size: 150px; border: 1px solid rgba(249,115,22,.24); background: radial-gradient(circle, rgba(249,115,22,.19), transparent 60%); }
  .rx-parecer-text { max-width: 840px; }
  .rx-parecer-text p { color: #f8fafc; font-size: 16.5px; line-height: 1.72; margin: 0; letter-spacing: .005em; font-weight: 500; }
  .rx-parecer-paragraphs { display: grid; gap: 14px; }
  .rx-parecer-text strong, .rx-parecer-text b { color: #fb923c; }
  .rx-inline-edit { margin-top: 18px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(249,115,22,.35); background: rgba(249,115,22,.13); color: #fed7aa; border-radius: 999px; padding: 9px 13px; font-size: 12px; font-weight: 900; cursor: pointer; }
  .rx-parecer-editor { display: grid; gap: 12px; }
  .rx-parecer-editor p { color: #cbd5e1; font-size: 13px; line-height: 1.55; font-weight: 700; }
  .rx-parecer-editor textarea { min-height: 260px; width: 100%; resize: vertical; border: 1px solid rgba(255,255,255,.12); border-radius: 18px; background: rgba(3,8,15,.72); color: #fff; padding: 16px; font-size: 15px; line-height: 1.65; outline: none; }
  .rx-parecer-editor textarea:focus { border-color: rgba(249,115,22,.45); box-shadow: 0 0 0 4px rgba(249,115,22,.08); }
  .rx-parecer-editor-actions { display: flex; justify-content: flex-end; gap: 10px; }
  .rx-parecer-steps { margin-top: 26px; display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid rgba(255,255,255,.12); border-radius: 16px; overflow: hidden; }
  .rx-parecer-steps span { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 12px; text-align: center; color: #fff; font-weight: 900; font-size: 12px; border-right: 1px solid rgba(255,255,255,.1); text-transform: uppercase; }
  .rx-parecer-steps svg { color: #f59e0b; }

  .rx-question-list { display: grid; gap: 16px; }
  .rx-question-card { border-radius: 18px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.045); padding: 22px; break-inside: avoid; }
  .rx-question-head { display: grid; grid-template-columns: 80px 1fr 120px; gap: 18px; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,.08); padding-bottom: 16px; margin-bottom: 16px; }
  .rx-question-number { width: 58px; height: 58px; display: grid; place-items: center; color: #07111f; background: linear-gradient(135deg,#f97316,#f59e0b); border-radius: 16px; font-weight: 1000; }
  .rx-question-head h3 { margin: 0; color: #fff; font-size: 20px; text-transform: uppercase; }
  .rx-question-status { text-align: right; font-weight: 1000; }
  .rx-question-status small { display: block; color: #cbd5e1; margin-top: 4px; }
  .rx-question-statement { color: #dbeafe; font-size: 15px; line-height: 1.65; margin: 0 0 16px; }
  .rx-question-annulled { position: relative; overflow: hidden; border-color: rgba(249,115,22,.32); }
  .rx-annulled-watermark { position: absolute; inset: 0; display: grid; place-items: center; transform: rotate(-12deg); color: rgba(249,115,22,.105); font-size: 88px; font-weight: 1000; letter-spacing: .08em; pointer-events: none; z-index: 0; }
  .rx-question-card > *:not(.rx-annulled-watermark) { position: relative; z-index: 1; }
  .rx-alternatives { display: grid; gap: 9px; margin: 18px 0; }
  .rx-alternative { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: flex-start; border-radius: 14px; border: 1px solid rgba(255,255,255,.09); background: rgba(3,8,15,.33); padding: 11px 13px; }
  .rx-alternative span { width: 30px; height: 30px; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,.06); color: #dbeafe; font-weight: 1000; }
  .rx-alternative p { margin: 0; color: #dbeafe; font-size: 13px; line-height: 1.55; }
  .rx-alternative.correct { border-color: rgba(34,197,94,.36); background: rgba(34,197,94,.08); }
  .rx-alternative.correct span { color: #052e16; background: #22c55e; }
  .rx-question-foot { display: flex; gap: 12px; flex-wrap: wrap; }
  .rx-question-foot span { display: inline-flex; align-items: center; gap: 6px; color: #cbd5e1; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); padding: 8px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; }
  .rx-question-foot strong { color: #fb923c; }
  .rx-empty { color: #cbd5e1; }

  .rx-final-premium { position: relative; margin: 10px 48px 48px; min-height: 430px; overflow: hidden; border: 1px solid rgba(249,115,22,.42); border-radius: 24px; background: radial-gradient(circle at 78% 20%, rgba(249,115,22,.22), transparent 28%), linear-gradient(135deg, rgba(249,115,22,.12), rgba(5,14,27,.96) 38%, rgba(3,8,15,.98)); box-shadow: 0 28px 90px rgba(0,0,0,.35), inset 0 0 80px rgba(249,115,22,.05); }
  .rx-final-premium::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(180deg, rgba(3,8,15,.04), rgba(3,8,15,.72)), url('${SECTION_ORANGE_BG}'); background-size: cover; background-position: center; opacity: .45; pointer-events: none; }
  .rx-final-visual { position: absolute; inset: 0; pointer-events: none; }
  .rx-final-owl { position: absolute; left: 22px; bottom: -18px; width: 330px; height: 430px; background-image: url('/images/raio-x/owl-footer.png'); background-size: contain; background-position: left bottom; background-repeat: no-repeat; filter: drop-shadow(0 0 34px rgba(249,115,22,.38)); opacity: .98; }
  .rx-final-glow { position: absolute; left: 120px; bottom: 36px; width: 330px; height: 110px; border-radius: 999px; background: radial-gradient(circle, rgba(249,115,22,.42), transparent 68%); filter: blur(24px); opacity: .55; }
  .rx-final-copy { position: relative; z-index: 1; margin-left: 380px; padding: 62px 56px 46px 22px; min-height: 430px; display: flex; flex-direction: column; justify-content: center; }
  .rx-final-eyebrow { display: inline-flex; width: fit-content; align-items: center; gap: 9px; border: 1px solid rgba(249,115,22,.35); background: rgba(249,115,22,.11); color: #fbbf24; border-radius: 999px; padding: 8px 13px; font-size: 11px; text-transform: uppercase; letter-spacing: .18em; font-weight: 1000; }
  .rx-final-eyebrow svg, .rx-final-pillars svg { color: #f59e0b; flex: none; }
  .rx-final-copy h2 { max-width: 720px; margin: 0 0 16px; color: #fff; font-size: 40px; line-height: 1.02; text-transform: uppercase; letter-spacing: -.045em; font-weight: 1000; text-shadow: 0 4px 28px rgba(0,0,0,.45); }
  .rx-final-copy p { max-width: 720px; color: #e5eefb; margin: 0 0 26px; font-size: 17px; line-height: 1.68; }
  .rx-final-pillars { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); border: 1px solid rgba(255,255,255,.11); border-radius: 18px; overflow: hidden; background: rgba(3,8,15,.45); backdrop-filter: blur(8px); }
  .rx-final-pillars span { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; min-height: 92px; padding: 14px 12px; color: #fff; text-align: center; font-size: 12px; line-height: 1.2; font-weight: 1000; text-transform: uppercase; border-right: 1px solid rgba(255,255,255,.1); }
  .rx-final-copy small { margin-top: 18px; color: #a9bed8; font-size: 12px; }
  .rx-break-avoid { break-inside: avoid; page-break-inside: avoid; }
  @media (max-width: 1100px) { .rx-subject-grid { grid-template-columns: repeat(auto-fit, minmax(190px, 210px)); justify-content: center; } .rx-profile-grid, .rx-kpis { grid-template-columns: repeat(2,1fr); } .rx-hero-badges { grid-template-columns: repeat(2,1fr); width: 560px; } .rx-parecer { grid-template-columns: 1fr; } .rx-final-copy { margin-left: 260px; } .rx-final-owl { width: 250px; height: 350px; left: 14px; } .rx-final-pillars { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 720px) { .rx-document { border-left: 0; border-right: 0; border-radius: 0; } .rx-hero-content { padding: 36px 24px; } .rx-hero h1 { font-size: 52px; } .rx-kpis, .rx-panel, .rx-final-premium { margin-left: 18px; margin-right: 18px; padding-left: 18px; padding-right: 18px; } .rx-kpis, .rx-subject-grid, .rx-profile-grid, .rx-conclusion-grid, .rx-topic-map { grid-template-columns: 1fr; } .rx-question-head { grid-template-columns: 1fr; } .rx-question-status { text-align: left; } .rx-final-premium { min-height: auto; padding: 0 !important; } .rx-final-owl { opacity: .18; width: 100%; height: 340px; left: 0; bottom: 0; } .rx-final-copy { margin-left: 0; padding: 36px 22px; } .rx-final-copy h2 { font-size: 30px; } .rx-final-pillars { grid-template-columns: 1fr; } }
  @media print { .no-print { display: none !important; } body, .rx-page { background: #030b16 !important; } .rx-document { max-width: none; width: 100%; border: 0; border-radius: 0; box-shadow: none; } }
`;
