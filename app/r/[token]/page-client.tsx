"use client";

import {
  BarChart3, BookOpen, Briefcase, Building2, Calendar,
  CheckCircle, FileText, Globe, Target,
} from "lucide-react";

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  dark: "#0B1220",
  orange: "#FF8A00",
  text: "#111827",
  textSec: "#475569",
  textMuted: "#94A3B8",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  green: "#16A34A",
  red: "#DC2626",
  amber: "#D97706",
};

const SUBJECT_COLORS = [
  "#F97316", "#0EA5E9", "#10B981", "#8B5CF6",
  "#F59E0B", "#EC4899", "#14B8A6", "#A855F7",
  "#EF4444", "#06B6D4",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripTags(html: string) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeModules(effective: any[], summarized: any[]) {
  if (!effective?.length) {
    return (summarized || []).sort((a: any, b: any) => (b.question_count || 0) - (a.question_count || 0));
  }
  return effective.map((em: any) => {
    const match = (summarized || []).find(
      (s: any) => (s.module || s.name || "").toLowerCase().trim() === (em.module || "").toLowerCase().trim(),
    );
    return { ...em, charging_profile: match?.charging_profile || null, subtopics: match?.subtopics || em.subtopics || [] };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeDominance(modules: any[], total: number) {
  if (!modules.length) return { hasDominant: false, tied: [] as any[], pct: 0, label: "—" };
  const topCount = Number(modules[0]?.question_count || 0);
  const tied = modules.filter((m: any) => Number(m.question_count || 0) === topCount && topCount > 0);
  const p = total > 0 ? Math.round((topCount / total) * 100) : 0;
  const hasDominant = tied.length === 1 && topCount > Number(modules[1]?.question_count || 0);
  return {
    hasDominant,
    tied,
    pct: p,
    label: hasDominant ? (tied[0]?.module || "—") : (tied.length > 1 ? "Empate técnico" : (modules[0]?.module || "—")),
  };
}

function diffColor(d?: number | null) {
  const v = Number(d || 0);
  if (v <= 0) return C.textMuted;
  if (v < 2.5) return C.green;
  if (v < 3.5) return C.amber;
  return C.red;
}

function diffBg(d?: number | null) {
  const v = Number(d || 0);
  if (v <= 0) return "#F8FAFC";
  if (v < 2.5) return "#DCFCE7";
  if (v < 3.5) return "#FEF3C7";
  return "#FEE2E2";
}

function diffLabel(d?: number | null) {
  const v = Number(d || 0);
  if (v <= 0) return "—";
  if (v < 2.5) return "Baixa";
  if (v < 3.5) return "Moderada";
  return "Alta";
}

function pctOf(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function quickReadText(modules: any[], total: number) {
  const dom = computeDominance(modules, total);
  if (!dom.hasDominant && dom.tied.length > 1) {
    return `A prova apresentou distribuição totalmente equilibrada: cada assunto representou ${dom.pct}% da cobrança, com uma questão por tema. Portanto, não houve predominância quantitativa real. O destaque de "${modules[0]?.module}" deve ser tratado apenas como primeiro assunto listado, não como domínio estatístico exclusivo.`;
  }
  return `A prova apresentou concentração em "${dom.label}" (${dom.pct}% das questões). Os demais temas tiveram participação mais reduzida. A estratégia de preparação deve priorizar o tema dominante, sem negligenciar os demais assuntos.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diagnosticText(modules: any[], total: number) {
  const dom = computeDominance(modules, total);
  const sorted = [...modules].sort((a: any, b: any) => (b.average_difficulty || 0) - (a.average_difficulty || 0));
  const hard = sorted[0]?.module || "";
  const easy = sorted[sorted.length - 1]?.module || "";
  if (!dom.hasDominant && dom.tied.length > 1) {
    return `Todos os assuntos tiveram exatamente o mesmo peso quantitativo na prova: ${modules[0]?.question_count || 1} questão cada. O diferencial está na dificuldade: ${hard} foi o ponto mais exigente${easy && easy !== hard ? ` e ${easy} o mais acessível` : ""}.`;
  }
  return `A prova concentrou ${dom.pct}% das questões em "${dom.label}". O assunto de maior dificuldade foi "${hard}"${easy && easy !== hard ? ` e o mais acessível "${easy}"` : ""}.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAchievements(modules: any[], total: number, avgDiff: number) {
  const dom = computeDominance(modules, total);
  const sorted = [...modules].sort((a: any, b: any) => (b.average_difficulty || 0) - (a.average_difficulty || 0));
  return [
    `A prova cobriu ${modules.length} área${modules.length !== 1 ? "s" : ""} diferentes de conhecimento.`,
    sorted.length >= 2 ? `Os temas mais difíceis foram: ${sorted.slice(0, 2).map((m: any) => m.module).join(" e ")}.` : null,
    sorted.length >= 2 ? `Os temas mais acessíveis foram: ${sorted.slice(-2).reverse().map((m: any) => m.module).join(" e ")}.` : null,
    dom.hasDominant
      ? `O assunto dominante foi "${dom.label}", representando ${dom.pct}% da prova.`
      : dom.tied.length > 1 ? `Não houve assunto dominante isolado. A cobrança foi equilibrada entre ${dom.tied.length} temas.` : null,
    `A preparação ideal exige estudo equilibrado${avgDiff >= 3.5 ? ", com foco especial nos temas de maior dificuldade" : ", sem abandonar tópicos básicos"}.`,
  ].filter(Boolean).slice(0, 5) as string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildExpertOpinion(modules: any[], total: number, avgDiff: number) {
  const dom = computeDominance(modules, total);
  const allSame = !dom.hasDominant && dom.tied.length > 1;
  let t = allSame
    ? `Para esse perfil de prova, o aluno não pode estudar apenas "os assuntos grandes". A banca distribuiu a cobrança de forma pulverizada.\n\nO melhor caminho é dominar os fundamentos de cada módulo e treinar questões objetivas, especialmente nos temas com maior dificuldade.`
    : `Para esse perfil de prova, a estratégia deve priorizar "${dom.label}" (${dom.pct}% das questões), sem negligenciar os demais temas.\n\nA concentração temática favorece a especialização, mas os itens complementares podem ser decisivos na pontuação final.`;
  if (avgDiff >= 3.5) t += `\n\nAtenção: a dificuldade elevada (${avgDiff.toFixed(1)}/5) exige treino intenso com questões de nível avançado.`;
  return t;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profileBodyText(modules: any[], total: number, avgDiff: number) {
  const dom = computeDominance(modules, total);
  const allSame = !dom.hasDominant && dom.tied.length > 1;
  const diversity = modules.length >= 5 ? "alta" : modules.length >= 3 ? "média" : "baixa";
  return [
    `A prova apresentou ${allSame ? "distribuição equilibrada entre todos os temas" : `concentração de ${dom.pct}% em "${dom.label}"`}, com diversidade temática ${diversity}.`,
    `O nível geral de dificuldade é ${diffLabel(avgDiff).toLowerCase()} (média ${avgDiff ? avgDiff.toFixed(1) : "—"}/5). ${avgDiff >= 3.5 ? "A banca exigiu domínio técnico aprofundado em vários assuntos." : avgDiff >= 2.5 ? "A banca equilibrou questões conceituais e práticas." : "A banca priorizou questões de reconhecimento e compreensão básica."}`,
    `${modules.length >= 5 ? "A alta diversidade temática indica uma estratégia de cobrança ampla, voltada ao conhecimento horizontal." : "A concentração temática favorece a preparação mais focada e vertical."}`,
  ].join("\n\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSynthesis(analysis: any) {
  const raw = analysis.final_summary_text || analysis.summary_text || "";
  if (!raw) return "";
  const noMd = raw
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^\|.*$/gm, "")
    .replace(/^[-=]{3,}\s*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  const clean = stripTags(noMd).replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 40) return "";
  const match = clean.match(/(?:S[íi]ntese|Conclus[aã]o|Panorama)\s*[:\s—]+(.{60,})/i);
  if (match?.[1]) return match[1].trim().slice(0, 550);
  const paras = clean.split(/\.\s+(?=[A-ZÁÉÍÓÚ])/).filter((s) => s.trim().length > 40);
  return paras.slice(0, 4).join(". ").slice(0, 550) || clean.slice(0, 550);
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function DiffBadge({ diff }: { diff?: number | null }) {
  const v = Number(diff || 0);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 9px", borderRadius: 100,
      background: diffBg(v), border: `1px solid ${diffColor(v)}30`,
      fontSize: 10, fontWeight: 700, color: diffColor(v), whiteSpace: "nowrap" as const,
    }}>
      {v > 0 ? `${v.toFixed(1)} / 5` : "—"} · {diffLabel(v)}
    </span>
  );
}

function SectionLabel({ title, subtitle, dark = false }: { title: string; subtitle?: string; dark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
      <div style={{ width: 4, minHeight: subtitle ? 48 : 32, background: C.orange, borderRadius: 2, flexShrink: 0, marginTop: 4 }} />
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: dark ? "#fff" : C.text, lineHeight: 1.2 }}>{title}</h2>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: dark ? "rgba(255,255,255,0.45)" : C.textSec }}>{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PublicRaioXClient({ analysis, effectiveModules, totalQuestions, withImage, avgDiff }: {
  analysis: any;
  effectiveModules?: any[];
  totalQuestions?: number;
  withImage?: number;
  avgDiff?: number;
}) {
  const modules = mergeModules(effectiveModules || [], analysis.modules_summary || []);
  const total = totalQuestions ?? modules.reduce((s: number, m: any) => s + Number(m.question_count || 0), 0);
  const diff = avgDiff ?? 0;
  const img = withImage ?? 0;

  const sorted = [...modules].sort((a: any, b: any) => (b.average_difficulty || 0) - (a.average_difficulty || 0));
  const hardest = sorted.slice(0, 2).map((m: any) => m.module as string);
  const easiest = sorted.slice(-2).reverse().map((m: any) => m.module as string).filter((m) => !hardest.includes(m));

  const dom = computeDominance(modules, total);
  const allSame = !dom.hasDominant && dom.tied.length > 1;
  const qr = quickReadText(modules, total);
  const synth = extractSynthesis(analysis);
  const items = buildAchievements(modules, total, diff);
  const opinion = buildExpertOpinion(modules, total, diff);
  const profileBody = profileBodyText(modules, total, diff);

  const genDate = analysis.updated_at
    ? new Date(analysis.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const metaItems = [
    { label: "Concurso", Icon: Building2, value: analysis.contest_name },
    { label: "Cargo", Icon: Briefcase, value: analysis.position_name },
    { label: "Banca", Icon: FileText, value: analysis.board_name },
    { label: "Ano", Icon: Calendar, value: analysis.exam_year ? String(analysis.exam_year) : null },
  ].filter((d) => d.value);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Arial, Helvetica, sans-serif" }}>

      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section style={{ background: C.dark, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: C.orange }} />
        <div style={{ position: "absolute", right: -140, top: -140, width: 520, height: 520, borderRadius: "50%", border: "1px solid rgba(255,138,0,0.07)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: -70, top: -70, width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(255,138,0,0.12)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 920, margin: "0 auto", padding: "72px 28px 80px", position: "relative" }}>

          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 52 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, border: "1px solid rgba(255,138,0,0.35)", color: C.orange, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 900 }}>◉</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", color: "#fff" }}>ESTUDO<span style={{ color: C.orange }}>TOP</span></div>
              <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.22em", color: "rgba(255,255,255,0.28)", marginTop: -2 }}>SIMULADOS</div>
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: "0.28em", textTransform: "uppercase" as const, marginBottom: 14 }}>
              Raio-X Estratégico de {analysis.discipline_name || "Informática"}
            </div>
            <div style={{ fontSize: 76, fontWeight: 900, color: "#fff", lineHeight: 0.88, letterSpacing: "-0.03em" }}>RAIO-X</div>
            <div style={{ fontSize: 76, fontWeight: 900, color: C.orange, lineHeight: 0.88, letterSpacing: "-0.03em" }}>DE PROVAS</div>
          </div>

          {/* Divider */}
          <div style={{ width: 60, height: 2, background: `linear-gradient(to right, ${C.orange}, transparent)`, marginBottom: 38 }} />

          {/* Metadata */}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 22, marginBottom: 52 }}>
            {metaItems.map((item, i) => {
              const Icon = item.Icon;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(255,138,0,0.1)", border: "1px solid rgba(255,138,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={13} color={C.orange} />
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.32)", textTransform: "uppercase" as const, letterSpacing: "0.15em" }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 1 }}>{item.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, maxWidth: 680 }}>
            {[
              { label: "Questões de Informática", value: String(total || 0) },
              { label: "Assuntos mapeados", value: String(modules.length) },
              { label: "Dificuldade média", value: diff ? `${diff.toFixed(1)} / 5` : "—" },
              { label: "Questões com imagem", value: String(img || 0) },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.36)", textTransform: "uppercase" as const, letterSpacing: "0.13em", marginBottom: 7, fontWeight: 700 }}>{kpi.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ══ CONTEÚDO ══════════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "44px 28px 64px" }}>

        {/* ── Visão Geral ── */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel title="Visão Geral" />
          <div style={{ background: "#FFFBF5", border: "1px solid #FFD196", borderRadius: 16, padding: "26px 30px", boxShadow: "0 2px 14px rgba(255,138,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${C.orange}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: C.orange, fontSize: 15 }}>★</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 900, color: C.orange, textTransform: "uppercase" as const, letterSpacing: "0.22em" }}>Leitura Rápida</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.85 }}>{qr}</p>
          </div>
        </div>

        {/* ── Mapa da Cobrança ── */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel title="Mapa da Cobrança" subtitle="Distribuição visual dos assuntos cobrados na prova." />

          <div style={{ overflowX: "auto" as const, marginBottom: 14 }}>
            <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", minWidth: 520 }}>
              <div style={{ background: C.dark, padding: "10px 20px", display: "grid", gridTemplateColumns: "1fr 72px 130px 140px", gap: 10 }}>
                {["Assunto", "Questões", "% da Prova", "Dificuldade"].map((h, i) => (
                  <div key={i} style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.48)", textTransform: "uppercase" as const, letterSpacing: "0.16em" }}>{h}</div>
                ))}
              </div>
              {modules.map((m: any, i: number) => {
                const count = Number(m.question_count || 0);
                const p = pctOf(count, total);
                const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 130px 140px", gap: 10, padding: "12px 20px", background: i % 2 === 0 ? "#fff" : "#FBFCFE", borderTop: `1px solid ${C.border}`, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{m.module}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>{count}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ flex: 1, height: 6, background: "#EEF2F7", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${p}%`, height: "100%", background: color, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 30 }}>{p}%</span>
                    </div>
                    <DiffBadge diff={m.average_difficulty} />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Target size={15} color="#0EA5E9" />
              </div>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#0EA5E9", textTransform: "uppercase" as const, letterSpacing: "0.18em" }}>Diagnóstico Visual</span>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: C.text, lineHeight: 1.7 }}>{diagnosticText(modules, total)}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {hardest.length > 0 && (
                <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "14px 16px", border: "1px solid #FEE2E2" }}>
                  <div style={{ fontSize: 9, fontWeight: 900, color: C.red, textTransform: "uppercase" as const, letterSpacing: "0.14em", marginBottom: 9 }}>Assuntos mais exigentes</div>
                  {hardest.map((m, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: C.text }}>{m}</span>
                    </div>
                  ))}
                </div>
              )}
              {easiest.length > 0 && (
                <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "14px 16px", border: "1px solid #DCFCE7" }}>
                  <div style={{ fontSize: 9, fontWeight: 900, color: C.green, textTransform: "uppercase" as const, letterSpacing: "0.14em", marginBottom: 9 }}>Assuntos mais acessíveis</div>
                  {easiest.map((m, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: C.text }}>{m}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── O que foi cobrado ── */}
        <div style={{ marginBottom: 40 }}>
          <SectionLabel title="O que foi cobrado em cada assunto" subtitle="Leitura detalhada dos conhecimentos exigidos dentro de cada tema." />
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            {modules.map((m: any, i: number) => {
              const count = Number(m.question_count || 0);
              const p = pctOf(count, total);
              const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
              const points: string[] = Array.isArray(m.knowledge_points) ? m.knowledge_points : [];
              const profile = (m.charging_profile || "").trim();
              return (
                <div key={i} style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ height: 4, background: color }} />
                  <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${color}30` }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color }}>{i + 1}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{m.module}</div>
                      <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{count} questão{count !== 1 ? "ões" : ""} · {p}% da prova</div>
                    </div>
                    <DiffBadge diff={m.average_difficulty} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                    <div style={{ padding: "14px 18px", borderRight: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 9, fontWeight: 900, color, textTransform: "uppercase" as const, letterSpacing: "0.16em", marginBottom: 10 }}>O que caiu</div>
                      {points.length > 0 ? points.slice(0, 6).map((pt, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 6 }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{pt}</span>
                        </div>
                      )) : <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>Não mapeado nesta análise.</span>}
                    </div>
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ fontSize: 9, fontWeight: 900, color, textTransform: "uppercase" as const, letterSpacing: "0.16em", marginBottom: 10 }}>Como a banca cobrou</div>
                      {profile ? <p style={{ margin: 0, fontSize: 12, color: C.text, lineHeight: 1.65 }}>{profile}</p>
                        : <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>Perfil não mapeado nesta análise.</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Perfil da Prova ── */}
        <div style={{ marginBottom: 8 }}>
          <SectionLabel title="Perfil da Prova" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
            {[
              { label: "Distribuição", value: allSame ? "Equilibrada" : "Concentrada", desc: allSame ? "Todos os temas tiveram o mesmo peso" : `Concentração em "${dom.label}"`, Icon: BarChart3, color: C.orange },
              { label: "Dificuldade Geral", value: diffLabel(diff), desc: `Média de ${diff ? diff.toFixed(1) : "—"} / 5`, Icon: Target, color: diffColor(diff) },
              { label: "Cobrança Predominante", value: "Conceitual e prática básica", desc: "Baseado no perfil das questões", Icon: BookOpen, color: "#8B5CF6" },
              { label: "Diversidade Temática", value: modules.length >= 5 ? "Alta" : modules.length >= 3 ? "Média" : "Baixa", desc: `${modules.length} assunto${modules.length !== 1 ? "s" : ""} mapeado${modules.length !== 1 ? "s" : ""}`, Icon: Globe, color: "#0EA5E9" },
            ].map((card, i) => {
              const Icon = card.Icon;
              return (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 16px", textAlign: "center" as const, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${card.color}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <Icon size={20} color={card.color} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 900, color: card.color, textTransform: "uppercase" as const, letterSpacing: "0.13em", marginBottom: 8 }}>{card.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: C.text, marginBottom: 5, lineHeight: 1.2 }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.4 }}>{card.desc}</div>
                </div>
              );
            })}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            {profileBody.split("\n\n").map((para, i, arr) => (
              <p key={i} style={{ margin: i < arr.length - 1 ? "0 0 12px" : 0, fontSize: 13, color: C.text, lineHeight: 1.75 }}>{para}</p>
            ))}
          </div>
        </div>

      </div>{/* /content */}

      {/* ══ CONCLUSÃO (dark) ══════════════════════════════════════════════════ */}
      <section style={{ background: C.dark }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "60px 28px 68px" }}>
          <SectionLabel title="Conclusão do Raio-X" dark />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18 }}>

            {/* Esquerda */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              {synth && (
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "20px 22px" }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, textTransform: "uppercase" as const, letterSpacing: "0.22em", marginBottom: 12 }}>Síntese Final</div>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.8 }}>{synth}</p>
                </div>
              )}
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "20px 22px" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, letterSpacing: "0.22em", marginBottom: 16 }}>Principais Achados</div>
                {items.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#F0FDF4", border: `1px solid ${C.green}35`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <CheckCircle size={12} color={C.green} />
                    </div>
                    <div style={{ lineHeight: 1.6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{i + 1}. </span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Parecer */}
            <div style={{ background: "rgba(255,138,0,0.07)", border: "1px solid rgba(255,138,0,0.2)", borderRadius: 14, padding: "24px 22px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: C.orange }} />
              <div style={{ fontSize: 9, fontWeight: 900, color: C.orange, textTransform: "uppercase" as const, letterSpacing: "0.26em", marginBottom: 4 }}>Parecer</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 18 }}>EstudoTOP</div>
              <div style={{ width: 38, height: 2, background: `linear-gradient(to right, ${C.orange}, transparent)`, marginBottom: 18 }} />
              {opinion.split("\n\n").map((para, i, arr) => (
                <p key={i} style={{ margin: i < arr.length - 1 ? "0 0 12px" : 0, fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.75 }}>{para}</p>
              ))}
              <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.22em" }}>EstudoTOP Simulados</div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer style={{ background: "#060D18", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid rgba(255,138,0,0.28)", color: C.orange, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900 }}>◉</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>ESTUDO<span style={{ color: C.orange }}>TOP</span></div>
              <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.2em", color: "rgba(255,255,255,0.25)", marginTop: -2 }}>SIMULADOS</div>
            </div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Raio-X Estratégico de Provas</div>
            {genDate && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>Gerado em {genDate}</div>}
          </div>
        </div>
      </footer>

    </div>
  );
}
