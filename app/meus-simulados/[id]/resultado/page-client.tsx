"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  Database,
  FileText,
  HardDrive,
  Lightbulb,
  MinusCircle,
  Monitor,
  Network,
  Server,
  Star,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";
import { supabase } from "@/app/lib/supabase/client";

const OWL_MARK = "\u{1F989}\uFE0F";

const FEEDBACK_COUNTDOWN_SECONDS = 10;

type ResultQuestion = {
  simulado_question_id: string;
  order_number: number;
  status: string;
  points: number;
  statement: string | null;
  explanation_text: string | null;
  subject: string | null;
  discipline: string | null;
  exam_board: string | null;
  question_type?: string | null;
  evaluated_topics?: string[];
  alternatives: {
    id: string;
    label: string;
    text: string;
    is_correct: boolean;
    selected: boolean;
  }[];
  selected_alternative_id: string | null;
  selected_alternative_label: string | null;
  correct_alternative_id: string | null;
  correct_alternative_label: string | null;
  is_correct: boolean | null;
};

type ResultPayload = {
  simulado: {
    id: string;
    title: string;
    description: string | null;
    scoring_model: "traditional" | "cebraspe";
    show_answer_key_on_finish: boolean;
    show_teacher_comment: boolean;
    correction_video_url: string | null;
    owl_help_enabled?: boolean;
  };
  attempt: {
    id: string;
    status: string;
    time_spent_seconds: number;
    submitted_at: string | null;
    disqualified_at: string | null;
    disqualification_reason: string | null;
  };
  result: {
    id: string;
    total_questions: number;
    answered_questions: number;
    correct_count: number;
    wrong_count: number;
    blank_count: number;
    annulled_count: number;
    score: number;
    display_score: number;
    max_score: number;
    percentage: number;
    display_percentage: number;
    scoring_model: string;
    time_spent_seconds: number;
    finished_at: string;
  } | null;
  average_display_percentage: number | null;
  total_results: number;
  student?: {
    name?: string | null;
    email?: string | null;
    cpf?: string | null;
  };
  behavior_metrics?: {
    tab_switch_count: number;
    focus_violation_count: number;
    inactivity_event_count: number;
    total_answer_changes: number;
    decision_index: number;
    scissors_usage_percent: number;
    scissors_question_count: number;
    owl_help_enabled?: boolean;
    owl_help_used_count?: number;
  };
  subjects: string[];
  gabarito: ResultQuestion[];
  jornada?: {
    student_jornada_id: string;
    title: string;
  } | null;
};

type TopicRollup = {
  label: string;
  aliases: string[];
  correct: number;
  wrong: number;
  blank: number;
  total: number;
};

type SubjectTopicPerformance = {
  subject: string;
  correct: number;
  wrong: number;
  blank: number;
  annulled: number;
  total: number;
  percent: number;
  masteredTopics: TopicRollup[];
  reviewTopics: TopicRollup[];
};


function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function richHtml(value?: string | null): string {
  return (value || "").replace(/<mark([^>]*)>/gi, '<mark data-highlight="true" class="bg-yellow-200 px-1 rounded">');
}

function formatNumber(value: number): string {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function formatPercent(value: number): string {
  const safe = Number(value || 0);
  const fixed = safe.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1").replace(".", ",");
}

type CorrectionVideoEmbed =
  | { kind: "html5"; src: string }
  | { kind: "iframe"; src: string };

function getCorrectionVideoEmbed(url?: string | null): CorrectionVideoEmbed | null {
  const raw = String(url || "").trim();
  if (!raw) return null;

  const isDirectVideo = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(raw);
  if (isDirectVideo) return { kind: "html5", src: raw };

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const videoId = parsed.pathname.replace(/^\//, "").split("/")[0];
      if (videoId) return { kind: "iframe", src: `https://www.youtube.com/embed/${videoId}` };
    }

    if (host.includes("youtube.com")) {
      const fromQuery = parsed.searchParams.get("v");
      const fromShorts = parsed.pathname.match(/\/shorts\/([^/?#]+)/i)?.[1];
      const fromEmbed = parsed.pathname.match(/\/embed\/([^/?#]+)/i)?.[1];
      const videoId = fromQuery || fromShorts || fromEmbed;
      if (videoId) return { kind: "iframe", src: `https://www.youtube.com/embed/${videoId}` };
    }

    if (host.includes("vimeo.com")) {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      if (videoId) return { kind: "iframe", src: `https://player.vimeo.com/video/${videoId}` };
    }

    if (host.includes("loom.com")) {
      const videoId = parsed.pathname.split("/").filter(Boolean).pop();
      if (videoId) return { kind: "iframe", src: `https://www.loom.com/embed/${videoId}` };
    }

    if (host.includes("drive.google.com")) {
      const fileId = parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] || parsed.searchParams.get("id");
      if (fileId) return { kind: "iframe", src: `https://drive.google.com/file/d/${fileId}/preview` };
    }

    return { kind: "iframe", src: raw };
  } catch {
    return { kind: "iframe", src: raw };
  }
}

function normalizeTextKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(protocolo|conceito|conceitos|nocao|nocoes|sobre|de|da|do|dos|das|em)\b/g, " ")
    .replace(/[^a-z0-9+/#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeTopicLabel(rawTopic: string): { key: string; label: string } {
  const original = String(rawTopic || "").trim().replace(/\s+/g, " ");
  const key = normalizeTextKey(original);
  if (!key) return { key: "", label: "" };

  const compact = key.replace(/[\s-]/g, "");
  const aliases: Array<[RegExp, string, string]> = [
    [/^(ram|memoriaram)$/i, "memoria ram", "Memória RAM"],
    [/^(cache|memoriacache)$/i, "memoria cache", "Memória Cache"],
    [/^(placamae|motherboard)$/i, "placa mae", "Placa-mãe"],
    [/^(hd|hdd|discorigido)$/i, "hd hdd", "HD/HDD"],
    [/^(ssd|unidadessd)$/i, "ssd", "SSD"],
    [/^(bios|uefi|biosuefi)$/i, "bios uefi", "BIOS/UEFI"],
    [/^(http|https|httphttps)$/i, "http https", "HTTP/HTTPS"],
    [/^(tcpip|tcp\/ip)$/i, "tcp ip", "TCP/IP"],
    [/^(ip|enderecoip|enderecamentoip)$/i, "endereco ip", "Endereço IP"],
    [/^(dns|sistemadns)$/i, "dns", "DNS"],
    [/^(dhcp)$/i, "dhcp", "DHCP"],
    [/^(url|uri)$/i, "url uri", "URL/URI"],
  ];

  for (const [pattern, canonicalKey, label] of aliases) {
    if (pattern.test(compact)) return { key: canonicalKey, label };
  }

  const semanticKey = key
    .replace(/^protocolo\s+/, "")
    .replace(/\s+protocolo$/, "")
    .replace(/\bmemoria\s+ram\b/, "memoria ram")
    .replace(/\bmemoria\s+cache\b/, "memoria cache")
    .trim();

  return { key: semanticKey || key, label: original };
}

function addTopicRollup(map: Map<string, TopicRollup>, topic: string, status: "correct" | "wrong" | "blank") {
  const canonical = canonicalizeTopicLabel(topic);
  if (!canonical.key) return;
  if (!map.has(canonical.key)) {
    map.set(canonical.key, { label: canonical.label, aliases: [], correct: 0, wrong: 0, blank: 0, total: 0 });
  }
  const item = map.get(canonical.key)!;
  if (!item.aliases.some((alias) => normalizeTextKey(alias) === normalizeTextKey(topic))) item.aliases.push(topic.trim());
  item.total += 1;
  if (status === "correct") item.correct += 1;
  if (status === "wrong") item.wrong += 1;
  if (status === "blank") item.blank += 1;
}

function buildSubjectTopicPerformance(questions: ResultQuestion[]): SubjectTopicPerformance[] {
  const map = new Map<string, SubjectTopicPerformance & { topicMap: Map<string, TopicRollup> }>();

  questions.forEach((question) => {
    const subject = question.subject || "Sem assunto";
    if (!map.has(subject)) {
      map.set(subject, { subject, correct: 0, wrong: 0, blank: 0, annulled: 0, total: 0, percent: 0, masteredTopics: [], reviewTopics: [], topicMap: new Map() });
    }
    const item = map.get(subject)!;
    item.total += 1;
    const isAnnulled = question.status === "annulled";
    const topics = Array.isArray(question.evaluated_topics) && question.evaluated_topics.length > 0 ? question.evaluated_topics : ["Tópico não informado"];

    if (isAnnulled) {
      item.annulled += 1;
      return;
    }

    const status: "correct" | "wrong" | "blank" = !question.selected_alternative_id ? "blank" : question.is_correct ? "correct" : "wrong";
    if (status === "correct") item.correct += 1;
    if (status === "wrong") item.wrong += 1;
    if (status === "blank") item.blank += 1;
    topics.forEach((topic) => addTopicRollup(item.topicMap, topic, status));
  });

  return Array.from(map.values())
    .map((item) => {
      const topics = Array.from(item.topicMap.values()).sort((a, b) => (b.wrong + b.blank) - (a.wrong + a.blank) || a.label.localeCompare(b.label));
      const validTotal = Math.max(0, item.total - item.annulled);
      return {
        subject: item.subject,
        correct: item.correct,
        wrong: item.wrong,
        blank: item.blank,
        annulled: item.annulled,
        total: item.total,
        percent: validTotal > 0 ? Math.round((item.correct / validTotal) * 100) : 0,
        masteredTopics: topics.filter((topic) => topic.correct > 0 && topic.wrong === 0 && topic.blank === 0),
        reviewTopics: topics.filter((topic) => topic.wrong > 0 || topic.blank > 0),
      };
    })
    .sort((a, b) => a.percent - b.percent || b.total - a.total || a.subject.localeCompare(b.subject));
}

function joinList(items: string[], emptyLabel: string) {
  const unique = Array.from(new Set(items.filter(Boolean)));
  if (unique.length === 0) return emptyLabel;
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} e ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} e ${unique[unique.length - 1]}`;
}

type ResultFeedbackBand = {
  min: number;
  max: number;
  title: string;
  label: string;
  owlSrc: string;
  owlAlt: string;
  tone: "red" | "orange" | "amber" | "emerald" | "gold";
  messages: string[];
};

const RESULT_FEEDBACK_BANDS: ResultFeedbackBand[] = [
  {
    min: 0,
    max: 10,
    title: "Preciso da sua atenção imediata",
    label: "Atenção imediata",
    owlSrc: "/images/resultados/coruja-resultado-1.png",
    owlAlt: "Coruja mentora preocupada com o resultado do simulado",
    tone: "red",
    messages: [
      "O resultado desta tentativa é preocupante e merece atenção imediata. Existem lacunas importantes na sua preparação e alguns conhecimentos precisarão ser reconstruídos. Isso não significa que sua aprovação está definida nem que este será seu desempenho na prova real. O simulado existe justamente para revelar esses pontos antes do dia da prova, quando ainda há tempo para corrigi-los.",
      "Este desempenho merece uma análise cuidadosa. O resultado é preocupante e indica que parte importante do conteúdo ainda não foi assimilada da forma necessária. A boa notícia é que o simulado cumpriu exatamente o seu papel: mostrar onde estão as maiores dificuldades para que elas possam ser enfrentadas antes da prova real.",
      "Este resultado revela fragilidades que não podem ser ignoradas. Existem conhecimentos fundamentais que precisarão ser fortalecidos e, em alguns casos, reconstruídos. Mais importante do que a nota obtida é compreender o que ela está revelando sobre a sua preparação neste momento. O diagnóstico pode ser duro, mas é muito mais útil agora do que no dia da prova.",
      "O resultado observado neste simulado é preocupante e indica que existem lacunas relevantes na sua base de conhecimentos. Isso não deve ser encarado como uma sentença nem como uma previsão sobre o concurso. O simulado funciona como um instrumento de diagnóstico e, neste caso, ele está mostrando de forma clara quais áreas da sua preparação precisam de atenção prioritária.",
      "A situação exige atenção. O desempenho desta tentativa mostra que ainda existem obstáculos importantes entre o seu nível atual de preparação e o desempenho necessário para competir em alto nível. Isso não significa que a aprovação esteja distante, mas mostra que alguns ajustes precisarão ser feitos com urgência para que sua evolução aconteça de forma consistente.",
    ],
  },
  {
    min: 11,
    max: 40,
    title: "Precisamos reconstruir conhecimentos importantes",
    label: "Reconstrução necessária",
    owlSrc: "/images/resultados/coruja-resultado-2.png",
    owlAlt: "Coruja mentora analisando pontos importantes da prova",
    tone: "orange",
    messages: [
      "O resultado mostra que você já possui algum contato com os conteúdos cobrados, mas ainda existem lacunas importantes que estão limitando o seu desempenho. Neste momento, o objetivo não deve ser apenas aumentar a quantidade de estudo, mas identificar exatamente quais conhecimentos precisam ser fortalecidos para gerar uma evolução consistente.",
      "Este desempenho indica que parte da sua base já está construída, mas ainda não da forma necessária para enfrentar uma prova competitiva com segurança. Existem conhecimentos importantes que precisarão ser revisados e consolidados para que o seu resultado evolua de maneira mais consistente.",
      "O resultado desta tentativa mostra que você já domina alguns tópicos, mas ainda está deixando muitos pontos pelo caminho. O simulado revelou áreas da sua preparação que precisam de atenção e que, quando fortalecidas, podem gerar um impacto significativo nos próximos resultados.",
      "Este resultado não deve ser visto como uma previsão sobre o seu desempenho no concurso. Ele representa um retrato da sua preparação neste momento. Existem conhecimentos que já começam a aparecer de forma consistente, mas ainda há fragilidades importantes que precisam ser tratadas para reduzir a distância até um desempenho mais competitivo.",
      "O desempenho obtido mostra que sua preparação já começou a produzir resultados, mas ainda existe um caminho importante a percorrer. Alguns conteúdos demonstram sinais de evolução, enquanto outros ainda apresentam dificuldades que merecem atenção especial. O mais importante agora é entender onde estão essas diferenças.",
    ],
  },
  {
    min: 41,
    max: 74,
    title: "Estamos indo bem, mas ainda em desenvolvimento",
    label: "Em desenvolvimento",
    owlSrc: "/images/resultados/coruja-resultado-3.png",
    owlAlt: "Coruja mentora subindo uma escada de evolução",
    tone: "amber",
    messages: [
      "O resultado desta tentativa mostra que sua preparação está evoluindo. Existe conhecimento sendo construído e parte importante dos conteúdos já começa a aparecer de forma consistente no seu desempenho. Ao mesmo tempo, ainda existem oscilações que podem custar pontos importantes em uma prova competitiva. O próximo passo é transformar conhecimento em consistência.",
      "Este resultado indica que você já deixou para trás a fase inicial da preparação. Há sinais claros de evolução e uma base que começa a se consolidar. No entanto, ainda existem pontos de instabilidade que impedem um desempenho mais seguro e previsível. A boa notícia é que essas diferenças costumam ser mais fáceis de corrigir do que construir a base do zero.",
      "Sua preparação já começa a produzir resultados mais consistentes. O desempenho demonstra que diversos conteúdos estão sendo assimilados corretamente, mas ainda existem oportunidades importantes de crescimento. Neste estágio, pequenas melhorias costumam gerar ganhos significativos no resultado final.",
      "O resultado mostra que você está avançando na direção correta. Existem conhecimentos consolidados e uma evolução perceptível em relação aos níveis iniciais de desempenho. Ainda assim, o caminho até um resultado verdadeiramente competitivo exige mais regularidade e maior domínio dos conteúdos que continuam gerando perda de pontos.",
      "Este é o tipo de resultado que mostra potencial. Sua preparação já produz acertos relevantes e demonstra que existe uma base sendo construída. O desafio agora não é começar do zero, mas reduzir as oscilações que ainda aparecem ao longo da prova. Quanto mais consistente for o seu desempenho, menor será a distância até os níveis mais altos de competitividade.",
    ],
  },
  {
    min: 75,
    max: 99,
    title: "Você está jogando em alto nível, mas ainda não atingiu o topo da montanha",
    label: "Alto nível",
    owlSrc: "/images/resultados/coruja-resultado-4.png",
    owlAlt: "Coruja mentora confiante diante de um resultado alto",
    tone: "emerald",
    messages: [
      "Seu desempenho nesta tentativa foi forte e demonstra domínio consistente de boa parte dos conteúdos cobrados. Esse é o tipo de resultado que mostra uma preparação competitiva. Ainda assim, concursos costumam ser decididos nos detalhes, e os pontos perdidos aqui podem representar uma diferença importante na classificação final.",
      "O resultado demonstra que sua preparação está em um nível elevado. Grande parte dos conteúdos já aparece de forma consistente no seu desempenho, o que é um excelente sinal. O desafio agora não é construir base, mas reduzir as perdas que ainda impedem um resultado ainda mais sólido.",
      "Este desempenho mostra que você está jogando em alto nível. Existe conhecimento, consistência e capacidade de transformar estudo em pontos na prova. Ao mesmo tempo, os resultados mais expressivos costumam surgir justamente quando os últimos ajustes começam a ser feitos com atenção.",
      "O resultado obtido demonstra que sua preparação está avançando de forma consistente. Você já superou muitas das dificuldades encontradas nas fases iniciais do estudo e apresenta um desempenho que merece ser valorizado. Agora é hora de concentrar esforços naquilo que ainda separa um bom resultado de um resultado excepcional.",
      "Sua preparação já produz resultados que podem ser considerados competitivos. O desempenho desta tentativa mostra que você está cada vez mais próximo dos níveis mais altos de desempenho. O risco, neste estágio, não é a falta de conhecimento, mas a acomodação diante dos progressos já conquistados.",
    ],
  },
  {
    min: 100,
    max: 100,
    title: "Desempenho perfeito nesta tentativa, mas precisa tomar cuidado",
    label: "Desempenho perfeito",
    owlSrc: "/images/resultados/coruja-resultado-5.png",
    owlAlt: "Coruja mentora satisfeita com o desempenho perfeito",
    tone: "gold",
    messages: [
      "Gabaritar um simulado é um resultado raro e merece reconhecimento. Nesta tentativa, você demonstrou domínio completo dos conteúdos cobrados e não deixou nenhum ponto pelo caminho. Ainda assim, é importante lembrar que um único simulado não define o desempenho que será obtido na prova real. O maior risco neste momento não é a falta de conhecimento, mas a sensação de que o trabalho já terminou.",
      "O resultado desta tentativa foi perfeito. Todos os pontos disponíveis foram conquistados e isso demonstra um excelente nível de preparação para os conteúdos cobrados. Mas existe uma diferença importante entre alcançar um desempenho excepcional uma vez e conseguir repeti-lo de forma consistente. O desafio agora é transformar este resultado em padrão.",
      "Poucos alunos conseguem concluir um simulado sem perder nenhum ponto. O resultado alcançado nesta tentativa demonstra conhecimento, atenção e consistência. Mesmo assim, o concurso não será decidido por este simulado, mas pela sua capacidade de manter esse nível de desempenho ao longo do tempo e em diferentes cenários de prova.",
      "Este é o melhor resultado possível dentro de um simulado. Você demonstrou domínio dos conteúdos avaliados e aproveitou todas as oportunidades de pontuação disponíveis nesta prova. O cuidado necessário agora é evitar a acomodação. Em concursos competitivos, a manutenção da disciplina costuma ser tão importante quanto o próprio conhecimento.",
      "O desempenho desta tentativa foi impecável. Não houve perda de pontos e isso demonstra um nível elevado de domínio sobre os conteúdos cobrados. Ainda assim, é importante manter os pés no chão. A prova real apresenta variáveis que não podem ser totalmente reproduzidas em um simulado. Use este resultado como confirmação de que sua preparação está evoluindo, mas não como motivo para diminuir o ritmo.",
    ],
  },
];

function pickResultFeedbackBand(percent: number): ResultFeedbackBand {
  const safe = Math.max(0, Math.min(100, Number(percent || 0)));
  return RESULT_FEEDBACK_BANDS.find((band) => safe >= band.min && safe <= band.max) || RESULT_FEEDBACK_BANDS[0];
}

function pickStableVariation(messages: string[], seed: string | number): string {
  if (!messages.length) return "";
  const text = String(seed || "estudotop");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return messages[hash % messages.length];
}

function getResultToneClass(tone: ResultFeedbackBand["tone"]) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "orange") return "border-orange-200 bg-orange-50 text-orange-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-yellow-200 bg-yellow-50 text-yellow-700";
}

function buildBehaviorSignals(result: NonNullable<ResultPayload["result"]>, metrics?: ResultPayload["behavior_metrics"]) {
  const totalQuestions = Math.max(1, Number(result.total_questions || 0));
  const tabSwitches = Number(metrics?.tab_switch_count || 0);
  const inactivityEvents = Number(metrics?.inactivity_event_count || 0);
  const decisionIndex = Number(metrics?.decision_index || 0);
  const scissorsPercent = Number(metrics?.scissors_usage_percent || 0);
  const blankPercent = totalQuestions > 0 ? (Number(result.blank_count || 0) / totalQuestions) * 100 : 0;

  const positives: string[] = [];
  const alerts: string[] = [];

  const excellentFocus = tabSwitches === 0 && inactivityEvents === 0;
  const compromisedFocus = tabSwitches >= 2 || inactivityEvents > 2;
  const firmDecision = decisionIndex <= 1;
  const strongResult = Number(result.display_percentage || 0) > 75;

  if (excellentFocus) positives.push("boa atenção");
  if (firmDecision && strongResult) positives.push("boa capacidade de decisão");

  if (compromisedFocus) alerts.push("foco comprometido");
  if (decisionIndex > 3) alerts.push("hesitação na tomada de decisões");
  if (blankPercent > 10) alerts.push("questões deixadas em branco");
  if (scissorsPercent <= 40) alerts.push("pouco uso da tesourinha");

  return { positives: positives.slice(0, 2), alerts: alerts.slice(0, 2) };
}

function joinBoldItems(items: string[]) {
  return items.map((item, index) => (
    <span key={item}>
      {index > 0 && (index === items.length - 1 ? " e " : ", ")}
      <strong>{item}</strong>
    </span>
  ));
}

function BehaviorSignalsParagraph({ result, metrics }: { result: NonNullable<ResultPayload["result"]>; metrics?: ResultPayload["behavior_metrics"] }) {
  const { positives, alerts } = buildBehaviorSignals(result, metrics);
  if (!positives.length && !alerts.length) return null;

  if (positives.length && alerts.length) {
    return (
      <p>
        Além da nota, alguns sinais chamaram atenção. Sua execução demonstrou {joinBoldItems(positives)} durante a resolução. Ao mesmo tempo, houve indícios de {joinBoldItems(alerts)}, pontos que serão detalhados nos próximos passos.
      </p>
    );
  }

  if (positives.length) {
    const focusText = positives.includes("boa atenção")
      ? " Você se manteve focado no simulado."
      : " Esse comportamento indica uma resolução mais segura.";
    return (
      <p>
        Além da nota, alguns sinais positivos chamaram atenção. Sua execução demonstrou {joinBoldItems(positives)} durante a resolução.{focusText} Esses pontos serão detalhados nos próximos passos.
      </p>
    );
  }

  return (
    <p>
      Além da nota, alguns sinais chamaram atenção. Houve indícios de {joinBoldItems(alerts)}, pontos que serão detalhados nos próximos passos.
    </p>
  );
}

export default function ResultadoClient({
  simuladoId,
  attemptId = null,
  studentJornadaId = null,
}: {
  simuladoId: string;
  attemptId?: string | null;
  studentJornadaId?: string | null;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultStep, setResultStep] = useState(0);
  // Etapa intermediária pós-finalização: só existe no fluxo da tentativa
  // recém-concluída (com attemptId na URL). A contagem roda enquanto o
  // resultado carrega por baixo — nenhuma chamada de backend é atrasada.
  const [feedbackCountdown, setFeedbackCountdown] = useState(() => (attemptId ? FEEDBACK_COUNTDOWN_SECONDS : 0));
  const isPreparingFeedback = feedbackCountdown > 0;

  useEffect(() => {
    if (feedbackCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setFeedbackCountdown((current) => current - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [feedbackCountdown]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    // Com attemptId, a API retorna a tentativa recém-finalizada (resultado
    // imediato); sem ele, retorna a primeira tentativa completa válida
    // (resultado oficial do histórico).
    const query = new URLSearchParams();
    if (attemptId) query.set("attemptId", attemptId);
    if (studentJornadaId) query.set("jornada", studentJornadaId);
    const queryString = query.toString();
    const res = await fetch(`/api/student/simulados/${simuladoId}/resultado${queryString ? `?${queryString}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json();
    if (!res.ok || !json.ok) { setError(json.message || "Erro ao carregar resultado."); setLoading(false); return; }
    setPayload(json);
    setLoading(false);
  }, [router, simuladoId, attemptId, studentJornadaId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);


  const performanceBySubject = useMemo(() => buildSubjectTopicPerformance(payload?.gabarito || []), [payload]);

  const preparingOverlay = (
    <AnimatePresence>
      {isPreparingFeedback && <FeedbackPreparingModal countdown={feedbackCountdown} />}
    </AnimatePresence>
  );

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">{preparingOverlay}<div className="rounded-xl border border-slate-200 bg-white px-8 py-6 text-sm text-slate-500 shadow-sm">Carregando resultado...</div></main>;
  if (error || !payload) return <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">{preparingOverlay}<div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"><AlertTriangle className="mx-auto text-red-500" size={32} /><h1 className="mt-4 text-base font-semibold text-slate-900">Não foi possível carregar o resultado</h1><p className="mt-2 text-sm text-slate-500">{error || "Resultado indisponível."}</p><Link href="/meus-simulados" className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft size={15} /> Voltar para Meus Simulados</Link></div></main>;

  const r = payload.result;
  const isDisqualified = payload.attempt.status === "disqualified";
  const timeSpent = r?.time_spent_seconds ?? payload.attempt.time_spent_seconds ?? 0;
  const totalQuestions = r?.total_questions ?? 0;
  const avgTime = totalQuestions > 0 ? timeSpent / totalQuestions : 0;
  const hasCorrectionVideo = Boolean(payload.simulado.correction_video_url);
  const steps = [
    { title: "Resultado geral", icon: <Trophy size={16} /> },
    { title: "Raio-X da Prova", icon: <BarChart3 size={16} /> },
    { title: "Desempenho por Assunto", icon: <Target size={16} /> },
    { title: "Comportamento", icon: <Brain size={16} /> },
    ...(hasCorrectionVideo ? [{ title: "Vídeo de Correção", icon: <BookOpen size={16} /> }] : []),
    { title: "Revisão das Questões", icon: <FileText size={16} /> },
    { title: "PDF do Simulado", icon: <FileText size={16} /> },
  ];
  const reviewStepIndex = hasCorrectionVideo ? 5 : 4;
  const statsStepIndex = hasCorrectionVideo ? 6 : 5;
  const videoStepIndex = hasCorrectionVideo ? 4 : -1;
  const safeStep = Math.min(Math.max(resultStep, 0), steps.length - 1);

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_10%,rgba(255,138,0,0.045),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(37,99,235,0.035),transparent_30%),linear-gradient(180deg,#F8FAFC_0%,#F4F7FB_100%)] px-4 py-5 text-slate-900 md:px-6">
      {preparingOverlay}
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-[18px] pb-14">
        <section className="relative overflow-hidden rounded-[10px] border border-slate-200/95 bg-[radial-gradient(circle_at_7%_50%,rgba(255,138,0,0.10),transparent_21%),linear-gradient(135deg,#FFFFFF_0%,#FFF9F2_52%,#FFFFFF_100%)] shadow-[0_12px_30px_rgba(15,23,42,0.075),0_2px_8px_rgba(15,23,42,0.035)]">
          <div className="h-[2px] bg-gradient-to-r from-[#FF5A00] to-[#FFB300]" />
          <div className="flex min-h-[96px] flex-col gap-5 px-6 py-4 md:flex-row md:items-center md:justify-between md:px-7">
            <div className="flex min-w-0 items-center gap-6">
              <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-orange-300/45 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.95),rgba(255,138,0,0.10))] text-orange-600 shadow-[0_8px_20px_rgba(255,122,0,0.12)]">
                <Trophy size={25} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[29px] font-extrabold leading-tight tracking-[-0.03em] text-slate-950">Resultado do Simulado</h1>
                <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{payload.simulado.title} · tentativa concluída</p>
              </div>
            </div>
            <Link href={payload.jornada ? `/minhas-jornadas/${payload.jornada.student_jornada_id}` : "/meus-simulados"} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white/90 px-6 text-sm font-bold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-px hover:border-slate-300 hover:bg-white">
              <ArrowLeft size={16} /> {payload.jornada ? "Voltar para a Jornada" : "Voltar para Meus Simulados"}
            </Link>
          </div>
        </section>

        {isDisqualified && (
          <section className="rounded-[18px] border border-red-200 bg-red-50/90 p-5 text-red-800 shadow-[0_10px_24px_rgba(239,68,68,0.08)]">
            <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={20} /><div><h2 className="font-bold">Tentativa encerrada por violação das regras</h2><p className="mt-1 text-sm">{payload.attempt.disqualification_reason || "A tentativa foi encerrada pelo sistema."}</p></div></div>
          </section>
        )}

        <div className="w-full rounded-[12px] border border-slate-200/95 bg-white/95 p-1.5 shadow-[0_8px_22px_rgba(15,23,42,0.055)]">
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            {steps.map((step, index) => (
              <button key={step.title} type="button" onClick={() => setResultStep(index)} className={`inline-flex h-11 shrink-0 items-center gap-2 border px-4 text-[12px] font-extrabold transition duration-200 ${safeStep === index ? "min-w-[158px] justify-center rounded-[9px] border-orange-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF7ED_100%)] text-[#FF5A00] shadow-[0_10px_22px_rgba(255,90,0,0.10),inset_0_1px_0_rgba(255,255,255,0.85)]" : "rounded-[8px] border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                {step.icon}{step.title}
              </button>
            ))}
          </div>
        </div>

        <section className="rounded-[18px] border border-slate-200/95 bg-white/95 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.075),0_2px_8px_rgba(15,23,42,0.04)] md:p-[22px]">
          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:mb-5">
            <div className="justify-self-start">
              <button type="button" onClick={() => setResultStep((current) => Math.max(0, current - 1))} disabled={safeStep === 0} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-400 shadow-[0_3px_10px_rgba(15,23,42,0.035)] transition duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55">
                <ChevronLeft size={16} /> Anterior
              </button>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-400">Etapa {safeStep + 1} de {steps.length}</p>
              <div className="mt-1 flex justify-center gap-1.5">{steps.map((step, index) => <span key={step.title} className={`h-1.5 w-1.5 rounded-full ${index === safeStep ? "bg-orange-500" : "bg-slate-300"}`} />)}</div>
              <h2 className="mt-1 text-[18px] font-extrabold leading-tight text-slate-950">{steps[safeStep].title}</h2>
            </div>
            <div className="justify-self-end">
              <button type="button" onClick={() => setResultStep((current) => Math.min(steps.length - 1, current + 1))} disabled={safeStep === steps.length - 1} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-orange-400/40 bg-gradient-to-r from-[#FF5A00] to-[#FF8A00] px-5 text-[13px] font-extrabold text-white shadow-[0_8px_18px_rgba(255,90,0,0.26),inset_0_1px_0_rgba(255,255,255,0.30)] transition duration-200 hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45">
                Próximo <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {safeStep === 0 && <ResultOverview result={r} behaviorMetrics={payload.behavior_metrics} />}
          {safeStep === 1 && <ResultExamXRay result={r} subjects={payload.subjects} simuladoTitle={payload.simulado.title} scoringModel={payload.simulado.scoring_model} finishedAt={r?.finished_at || payload.attempt.submitted_at} />}
          {safeStep === 2 && <ResultSubjects performance={performanceBySubject} subjects={payload.subjects} answerKeyVisible={payload.simulado.show_answer_key_on_finish} onGoToReview={() => setResultStep(reviewStepIndex)} />}
          {safeStep === 3 && <ResultBehavior result={r} metrics={payload.behavior_metrics} timeSpent={timeSpent} avgTime={avgTime} />}
          {hasCorrectionVideo && safeStep === videoStepIndex && <ResultCorrectionVideo correctionVideoUrl={payload.simulado.correction_video_url!} />}
          {safeStep === reviewStepIndex && <ResultQuestions questions={payload.gabarito} showAnswerKey={payload.simulado.show_answer_key_on_finish} showTeacherComment={payload.simulado.show_teacher_comment} />}
          {safeStep === statsStepIndex && <ResultSimuladoPdf payload={payload} />}
        </section>
      </div>
    </main>
  );
}

function FeedbackPreparingModal({ countdown }: { countdown: number }) {
  const ringRadius = 52;
  const circumference = 2 * Math.PI * ringRadius;
  const progress = Math.max(0, Math.min(1, countdown / FEEDBACK_COUNTDOWN_SECONDS));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeOut" } }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      role="dialog"
      aria-modal="true"
      aria-label="Preparando seu feedback"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ duration: 0.35, ease: [0.22, 0.9, 0.3, 1] }}
        className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-orange-100 bg-[linear-gradient(160deg,#FFFFFF_0%,#FFF9F1_55%,#FFFFFF_100%)] px-6 py-9 text-center shadow-[0_40px_90px_rgba(2,6,23,0.45)] md:px-10"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#FF5A00] via-[#FFB300] to-[#FF5A00]" />
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-orange-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" />

        <div className="relative">
          <div className="flex items-center justify-center gap-2 text-2xl" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <motion.span
                key={index}
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: index * 0.18, ease: "easeInOut" }}
              >
                {OWL_MARK}
              </motion.span>
            ))}
          </div>

          <h2 className="mt-4 text-[26px] font-black leading-[1.15] tracking-[-0.03em] text-slate-950 md:text-[30px]">
            Nossas corujas estão reunidas
            <br />
            montando seu feedback
          </h2>

          <p className="mx-auto mt-4 max-w-md text-sm font-medium leading-6 text-slate-500">
            Aqui você verá seus erros e acertos de forma organizada.
            <br />
            Navegue por todas as abas com muita atenção para aproveitar cada análise.
          </p>

          <div className="relative mx-auto mt-7 h-[132px] w-[132px]">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="#F1E8DC" strokeWidth="8" />
              <motion.circle
                cx="60"
                cy="60"
                r={ringRadius}
                fill="none"
                stroke="url(#feedbackCountdownGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={false}
                animate={{ strokeDashoffset: circumference * (1 - progress) }}
                transition={{ duration: 1, ease: "linear" }}
              />
              <defs>
                <linearGradient id="feedbackCountdownGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FF7A00" />
                  <stop offset="100%" stopColor="#FFC400" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0">
              <AnimatePresence initial={false}>
                <motion.span
                  key={countdown}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.25 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="absolute inset-0 flex items-center justify-center text-[44px] font-black tracking-[-0.04em] text-slate-950"
                >
                  {countdown}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          <p aria-live="polite" className="mt-4 text-sm font-bold text-slate-700">
            Seu feedback estará pronto em{" "}
            <strong className="text-[#FF5A00]">
              {countdown} segundo{countdown === 1 ? "" : "s"}
            </strong>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ResultOverview({ result, behaviorMetrics }: { result: ResultPayload["result"]; behaviorMetrics?: ResultPayload["behavior_metrics"] }) {
  if (!result) return <EmptyState text="O resultado desta tentativa ainda não está disponível." />;
  const feedbackBand = pickResultFeedbackBand(result.display_percentage);
  const feedbackMessage = pickStableVariation(feedbackBand.messages, result.id);
  const feedbackToneClass = getResultToneClass(feedbackBand.tone);
  const correctPercent = result.total_questions > 0 ? (result.correct_count / result.total_questions) * 100 : 0;
  const wrongPercent = result.total_questions > 0 ? (result.wrong_count / result.total_questions) * 100 : 0;
  const blankPercent = result.total_questions > 0 ? (result.blank_count / result.total_questions) * 100 : 0;
  const avgTime = result.total_questions > 0 ? result.time_spent_seconds / result.total_questions : 0;

  return (
    <div className="relative overflow-visible rounded-[22px] border border-slate-200/95 bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF8EF_48%,#FFFFFF_100%)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] md:p-5 lg:pt-20 xl:p-6 xl:pt-20">
      <section className="relative mt-8 overflow-visible rounded-[20px] border border-orange-200/80 bg-[radial-gradient(circle_at_17%_48%,rgba(255,138,0,0.10),transparent_34%),radial-gradient(circle_at_70%_44%,rgba(255,138,0,0.055),transparent_30%),linear-gradient(135deg,#FFFFFF_0%,#FFFDF8_48%,#FFFFFF_100%)] px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.055)] md:px-6 lg:mt-0 lg:px-7 lg:py-6">
        <div className="pointer-events-none absolute left-[43%] top-1/2 hidden h-[250px] w-[520px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.07),transparent_68%)] lg:block" />
        <div className="pointer-events-none absolute -left-4 -top-[78px] z-20 hidden h-[455px] w-[420px] lg:block xl:-left-7 xl:-top-[96px] xl:h-[505px] xl:w-[470px] 2xl:-left-10 2xl:-top-[108px] 2xl:h-[540px] 2xl:w-[510px]">
          <div className="absolute inset-x-9 bottom-5 h-[250px] rounded-full bg-[radial-gradient(circle_at_50%_62%,rgba(255,138,0,0.16),transparent_67%)] blur-[3px]" />
          <div className="absolute inset-x-12 bottom-2 h-16 rounded-full bg-slate-900/10 blur-2xl" />
          <img src={feedbackBand.owlSrc} alt={feedbackBand.owlAlt} className="absolute bottom-[-28px] left-1/2 h-[470px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_30px_34px_rgba(15,23,42,0.18)] xl:h-[520px] 2xl:h-[555px]" />
        </div>

        <div className="grid min-h-[370px] items-center gap-6 lg:grid-cols-[385px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] 2xl:grid-cols-[455px_minmax(0,1fr)]">
          <div className="relative flex h-[340px] min-w-0 items-end justify-center overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_52%_58%,rgba(255,138,0,0.13),transparent_58%)] lg:h-[350px] lg:overflow-visible lg:bg-transparent">
            <img src={feedbackBand.owlSrc} alt={feedbackBand.owlAlt} className="absolute bottom-[-140px] left-1/2 h-[520px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_24px_28px_rgba(15,23,42,0.13)] lg:hidden" />
          </div>

          <div className="relative z-10 min-w-0 py-1 lg:pl-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF5A00]">Parecer da Coruja</p>
            <span className={`mt-3 inline-flex min-h-[30px] items-center gap-2 rounded-full border px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ${feedbackToneClass}`}><Star size={14} strokeWidth={1.9} />{feedbackBand.label}</span>
            <h3 className="mt-3 max-w-5xl text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] text-slate-950 md:text-[28px] xl:text-[30px]">{feedbackBand.title}</h3>

            <div className="mt-4 max-w-5xl rounded-[20px] border border-orange-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,248,237,0.88))] p-4 shadow-[0_12px_28px_rgba(255,90,0,0.08),inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#FFF4C7,#FFB020)] text-orange-800 shadow-[0_10px_20px_rgba(255,176,32,0.26)]"><Trophy size={22} /></span>
                <p className="text-[17px] font-extrabold leading-7 tracking-[-0.02em] text-slate-950">
                  Você acertou <strong className="text-emerald-600">{result.correct_count}</strong> das <strong className="text-emerald-600">{result.total_questions}</strong> questões deste simulado, alcançando um aproveitamento de <strong className="text-[#FF5A00]">{formatPercent(result.display_percentage)}%</strong>.
                </p>
              </div>
            </div>

            <div className="mt-4 max-w-5xl space-y-3 text-[14px] font-medium leading-7 text-slate-600">
              <p>{feedbackMessage}</p>
              <BehaviorSignalsParagraph result={result} metrics={behaviorMetrics} />
              <p className="font-bold text-slate-800">Nos próximos passos vamos identificar os principais fatores que contribuíram para este resultado.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniResultMetric tone="emerald" icon={<CheckCircle2 size={28} />} label="Acertos" value={String(result.correct_count)} detail={`${formatPercent(correctPercent)}%`} chart="bars" />
        <MiniResultMetric tone="red" icon={<XCircle size={28} />} label="Erros" value={String(result.wrong_count)} detail={`${formatPercent(wrongPercent)}%`} chart="bars" />
        <MiniResultMetric tone="slate" icon={<MinusCircle size={28} />} label="Em branco" value={String(result.blank_count)} detail={`${formatPercent(blankPercent)}%`} chart="bars" />
        <MiniResultMetric tone="violet" icon={<Clock3 size={28} />} label="Tempo total" value={formatTime(result.time_spent_seconds)} detail={`${formatTime(avgTime)} por questão`} chart="line" />
      </div>
    </div>
  );
}


function ResultExamXRay({ result, subjects, simuladoTitle, scoringModel, finishedAt }: { result: ResultPayload["result"]; subjects: string[]; simuladoTitle: string; scoringModel: "traditional" | "cebraspe"; finishedAt?: string | null }) {
  if (!result) return <EmptyState text="O raio-x desta tentativa ainda não está disponível." />;

  const totalQuestions = Number(result.total_questions || 0);
  const timeSpent = Number(result.time_spent_seconds || 0);
  const avgTime = totalQuestions > 0 ? timeSpent / totalQuestions : 0;
  const validQuestions = Math.max(0, totalQuestions - Number(result.annulled_count || 0));
  const answeredPercent = totalQuestions > 0 ? (Number(result.answered_questions || 0) / totalQuestions) * 100 : 0;
  const correctPercent = totalQuestions > 0 ? (Number(result.correct_count || 0) / totalQuestions) * 100 : 0;
  const wrongPercent = totalQuestions > 0 ? (Number(result.wrong_count || 0) / totalQuestions) * 100 : 0;
  const uniqueSubjects = subjects.length;
  const finishedDate = finishedAt
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(finishedAt))
    : "—";
  const modelLabel = scoringModel === "cebraspe" ? "CEBRASPE" : "Tradicional";

  return (
    <div className="space-y-5">
      <section className="relative mt-10 overflow-visible rounded-[20px] border border-orange-200/80 bg-[radial-gradient(circle_at_18%_48%,rgba(255,138,0,0.11),transparent_34%),radial-gradient(circle_at_72%_44%,rgba(255,138,0,0.055),transparent_30%),linear-gradient(135deg,#FFFFFF_0%,#FFFDF8_48%,#FFFFFF_100%)] px-4 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-5 lg:mt-12 lg:px-6 lg:py-6">
        <div className="pointer-events-none absolute left-[45%] top-1/2 hidden h-[230px] w-[470px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.07),transparent_68%)] lg:block" />
        <div className="pointer-events-none absolute -left-4 -top-[70px] z-20 hidden h-[430px] w-[385px] lg:block xl:-left-6 xl:-top-[82px] xl:h-[455px] xl:w-[410px] 2xl:-left-8 2xl:-top-[92px] 2xl:h-[485px] 2xl:w-[440px]">
          <div className="absolute inset-x-8 bottom-3 h-[230px] rounded-full bg-[radial-gradient(circle_at_50%_62%,rgba(255,138,0,0.17),transparent_67%)] blur-[3px]" />
          <div className="absolute inset-x-12 bottom-0 h-16 rounded-full bg-slate-900/10 blur-2xl" />
          <img
            src="/images/raio-x/coruja-raio-x.png"
            alt="Coruja do EstudoTOP realizando o raio-x da prova"
            className="absolute bottom-[-32px] left-1/2 h-[450px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_30px_34px_rgba(15,23,42,0.18)] xl:h-[478px] 2xl:h-[510px]"
          />
        </div>

        <div className="grid min-h-[336px] items-center gap-6 lg:grid-cols-[355px_minmax(0,1fr)] xl:grid-cols-[385px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="relative flex h-[305px] min-w-0 items-end justify-center overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_52%_58%,rgba(255,138,0,0.13),transparent_58%)] lg:h-[320px] lg:overflow-visible lg:bg-transparent">
            <img
              src="/images/raio-x/coruja-raio-x.png"
              alt="Coruja do EstudoTOP realizando o raio-x da prova"
              className="absolute bottom-[-150px] left-1/2 h-[480px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_24px_28px_rgba(15,23,42,0.13)] lg:hidden"
            />
          </div>

          <div className="relative z-10 min-w-0 py-1 xl:py-2">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF5A00]">Raio-X da Prova</p>
                <h3 className="mt-2 text-[25px] font-extrabold leading-[1.05] tracking-[-0.03em] text-slate-950 md:text-[29px]">Como foi esta tentativa</h3>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-7 text-slate-600">Aqui estão os dados estruturais do simulado e da sua execução: assuntos cobrados, volume de questões, acertos, erros, anuladas e tempo de resolução.</p>
              </div>
              <div className="shrink-0 rounded-[16px] border border-orange-200 bg-white/90 px-5 py-4 text-left shadow-[0_12px_24px_rgba(255,90,0,0.07),inset_0_1px_0_rgba(255,255,255,0.85)] md:text-right">
                <p className="text-[11px] font-extrabold text-[#FF5A00]">Aproveitamento</p>
                <p className="mt-2 text-[31px] font-extrabold leading-none tracking-[-0.04em] text-[#FF5A00]">{formatPercent(result.display_percentage)}%</p>
              </div>
            </div>

            <div className="mt-5 grid auto-rows-fr gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <XRayMetric tone="slate" icon={<FileText size={22} />} label="Questões" value={String(totalQuestions)} detail={`${validQuestions} válidas`} mini="bars" />
              <XRayMetric tone="emerald" icon={<CheckCircle2 size={22} />} label="Acertos" value={String(result.correct_count)} detail={`${formatPercent(correctPercent)}%`} mini="line" />
              <XRayMetric tone="red" icon={<XCircle size={22} />} label="Erros" value={String(result.wrong_count)} detail={`${formatPercent(wrongPercent)}%`} mini="bars" />
              <XRayMetric tone="amber" icon={<MinusCircle size={22} />} label="Anuladas" value={String(result.annulled_count)} detail={result.annulled_count > 0 ? "sem penalização" : "nenhuma"} mini="line" />
              <XRayMetric tone="violet" icon={<Clock3 size={22} />} label="Tempo total" value={formatTime(timeSpent)} detail="tempo usado" mini="line" />
              <XRayMetric tone="blue" icon={<Target size={22} />} label="Por questão" value={formatTime(avgTime)} detail="média" mini="bars" />
              <XRayMetric tone="orange" icon={<BarChart3 size={22} />} label="Respondidas" value={`${formatPercent(answeredPercent)}%`} detail={`${result.answered_questions} de ${totalQuestions}`} mini="line" />
              <XRayMetric tone="slate" icon={<BookOpen size={22} />} label="Assuntos" value={String(uniqueSubjects)} detail={uniqueSubjects === 1 ? "cobrado" : "cobrados"} mini="bars" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <div className="rounded-[18px] border border-slate-200/95 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF5A00]">Assuntos do simulado</p>
              <h4 className="mt-2 text-xl font-extrabold tracking-[-0.02em] text-slate-950">Conteúdos cobrados nesta prova</h4>
            </div>
            <span className="rounded-[12px] border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-extrabold text-[#FF5A00]">{uniqueSubjects || 0} assunto(s)</span>
          </div>
          {subjects.length ? (
            <div className="mt-7 flex flex-wrap gap-2.5">
              {subjects.map((subject) => (
                <span key={subject} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-[linear-gradient(135deg,#FFFFFF,#F8FAFC)] px-5 text-sm font-extrabold text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.035)]"><BookOpen size={16} className="text-slate-500" />{subject}</span>
              ))}
            </div>
          ) : (
            <EmptyState text="Nenhum assunto foi identificado neste simulado." />
          )}
          <div className="mt-4 rounded-[14px] border border-orange-100 bg-[linear-gradient(135deg,#FFF7ED,#FFFFFF)] px-5 py-4 text-sm font-medium leading-6 text-slate-600">
            <p>A prova abordou {uniqueSubjects || 0} assunto específico.</p>
            <p className="mt-1">Revise os conteúdos para consolidar ainda mais seu aprendizado.</p>
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200/95 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] md:p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF5A00]">Dados da tentativa</p>
          <div className="mt-5 space-y-2.5">
            <XRayInfoLine icon={<FileText size={15} />} label="Simulado" value={simuladoTitle} />
            <XRayInfoLine icon={<Clock3 size={15} />} label="Finalização" value={finishedDate} />
            <XRayInfoLine icon={<Target size={15} />} label="Correção" value={modelLabel} />
            <XRayInfoLine icon={<Star size={15} />} label="Nota" value={`${formatNumber(result.display_score)} de ${formatNumber(result.max_score)}`} />
          </div>
        </div>
      </div>
    </div>
  );
}



function ResultSubjects({ performance, subjects, answerKeyVisible, onGoToReview }: { performance: SubjectTopicPerformance[]; subjects: string[]; answerKeyVisible: boolean; onGoToReview: () => void }) {
  if (!answerKeyVisible) return <LockedResult />;

  const assessedSubjectsCount = performance.length || subjects.length;
  const totalTopicsToReview = performance.reduce((acc, item) => acc + item.reviewTopics.length, 0);

  return (
    <div className="space-y-3.5">
      <section className="relative mt-8 overflow-visible rounded-[18px] border border-orange-200/80 bg-[radial-gradient(circle_at_18%_50%,rgba(255,138,0,0.10),transparent_34%),radial-gradient(circle_at_72%_45%,rgba(255,138,0,0.055),transparent_30%),linear-gradient(135deg,#FFFFFF_0%,#FFFDF9_48%,#FFFFFF_100%)] px-5 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-6 lg:mt-10 lg:px-7">
        <div className="pointer-events-none absolute left-[46%] top-1/2 hidden h-[210px] w-[440px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.07),transparent_68%)] lg:block" />
        <div className="pointer-events-none absolute -left-1 -top-[78px] z-20 hidden h-[365px] w-[520px] lg:block 2xl:-left-3 2xl:-top-[92px] 2xl:h-[390px] 2xl:w-[560px]">
          <div className="absolute inset-x-8 bottom-0 h-[210px] rounded-full bg-[radial-gradient(circle_at_50%_60%,rgba(255,138,0,0.16),transparent_67%)] blur-[2px]" />
          <img
            src="/images/resultados/coruja-analise-assuntos.png"
            alt="Coruja do EstudoTOP analisando o desempenho por assunto"
            className="absolute bottom-[-24px] left-0 h-[430px] max-w-none object-contain drop-shadow-[0_28px_30px_rgba(15,23,42,0.16)] 2xl:h-[462px]"
          />
        </div>
        <div className="grid min-h-[250px] items-center gap-6 lg:grid-cols-[500px_minmax(0,1fr)_410px] 2xl:grid-cols-[535px_minmax(0,1fr)_440px]">
          <div className="relative flex h-[250px] min-w-0 items-end justify-center overflow-hidden rounded-[16px] bg-[radial-gradient(circle_at_52%_62%,rgba(255,138,0,0.13),transparent_58%)] lg:h-[250px] lg:overflow-visible lg:bg-transparent">
            <img
              src="/images/resultados/coruja-analise-assuntos.png"
              alt="Coruja do EstudoTOP analisando o desempenho por assunto"
              className="absolute bottom-[-190px] left-1/2 h-[520px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_24px_28px_rgba(15,23,42,0.13)] lg:hidden"
            />
          </div>

          <div className="relative z-10 max-w-[440px]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5A00]">Desempenho por Assunto</p>
            <h3 className="mt-3 text-[26px] font-black leading-[1.10] tracking-[-0.035em] text-slate-950 md:text-[29px]">
              Onde você acertou e onde precisa revisar
            </h3>
            <div className="mt-4 space-y-2.5 text-[14px] font-medium leading-7 text-slate-600">
              <p>Veja seu desempenho em cada assunto da prova.</p>
              <p>
                Revise os tópicos com <strong className="font-extrabold text-red-600">erros</strong> ou questões <strong className="font-extrabold text-orange-600">em branco</strong> para fortalecer seus pontos fracos e chegar ainda mais preparado na próxima tentativa.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
            <SubjectExecutiveCard icon={<Target size={24} />} label="Assuntos avaliados" value={String(assessedSubjectsCount)} detail={assessedSubjectsCount === 1 ? "assunto" : "assuntos"} tone="green" />
            <SubjectExecutiveCard icon={<CircleAlert size={24} />} label="Tópicos para revisar" value={String(totalTopicsToReview)} detail={totalTopicsToReview === 1 ? "tópico identificado" : "tópicos identificados"} tone="red" />
          </div>
        </div>
      </section>

      <section className="rounded-[16px] border border-orange-200/80 bg-[linear-gradient(135deg,rgba(255,122,0,0.05),rgba(255,255,255,0.97))] px-5 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.045)]">
        <p className="text-[14px] font-medium leading-7 text-slate-700">
          Analisamos detalhadamente as questões em que você não obteve êxito. Os tópicos apresentados nos cards abaixo correspondem aos conteúdos cobrados justamente nessas questões e, por isso, recomendamos fortemente que você os revise antes de realizar uma nova tentativa.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {performance.length ? performance.map((item) => (
          <SubjectPerformanceCard key={item.subject} item={item} />
        )) : <div className="lg:col-span-3"><EmptyState text="Ainda não há dados por assunto para esta tentativa." /></div>}
      </section>

      <section className="flex flex-col gap-4 rounded-[16px] border border-slate-200/95 bg-[linear-gradient(135deg,rgba(255,122,0,0.045),rgba(255,255,255,0.96))] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.045)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-[#FF5A00] shadow-[0_8px_18px_rgba(255,122,0,0.08)]">
            <Lightbulb size={24} />
          </div>
          <div>
            <h4 className="text-[16px] font-black tracking-[-0.02em] text-slate-950">Dica de estudo</h4>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-600">Foque nos tópicos indicados em cada assunto. Revisar com estratégia é o caminho para transformar seus pontos fracos em pontos fortes.</p>
          </div>
        </div>
        <button type="button" onClick={onGoToReview} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-orange-200 bg-white/90 px-5 text-sm font-extrabold text-[#FF5A00] shadow-[0_8px_18px_rgba(255,122,0,0.08)] transition duration-200 hover:-translate-y-px hover:bg-orange-50">
          Ir para a Revisão Geral <ChevronRight size={16} />
        </button>
      </section>
    </div>
  );
}

function SubjectExecutiveCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "green" | "red" }) {
  const styles = tone === "green"
    ? "border-emerald-200/80 bg-[linear-gradient(135deg,rgba(16,185,129,0.07),rgba(255,255,255,0.96))] text-emerald-700 shadow-[0_10px_22px_rgba(16,185,129,0.08)]"
    : "border-red-200/80 bg-[linear-gradient(135deg,rgba(239,68,68,0.065),rgba(255,255,255,0.96))] text-red-600 shadow-[0_10px_22px_rgba(239,68,68,0.07)]";
  const iconStyles = tone === "green" ? "bg-emerald-100/80 text-emerald-600" : "bg-red-100/80 text-red-600";

  return (
    <div className={`min-h-[104px] rounded-[16px] border p-4 ${styles}`}>
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconStyles}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 text-[28px] font-black leading-none tracking-[-0.03em] text-slate-950">{value}</p>
          <p className={`mt-1 text-[13px] font-bold ${tone === "green" ? "text-emerald-700" : "text-red-600"}`}>{detail}</p>
        </div>
      </div>
    </div>
  );
}

function SubjectPerformanceCard({ item }: { item: SubjectTopicPerformance }) {
  const needsReview = item.wrong + item.blank > 0;
  const colors = getSubjectVisual(item.subject, needsReview);
  const progressGradient = needsReview
    ? item.percent < 50
      ? "from-[#FF5A00] to-red-500"
      : "from-[#FF7A00] to-[#FFB300]"
    : "from-emerald-600 to-emerald-400";

  return (
    <article className={`group flex min-h-[216px] flex-col rounded-[16px] border bg-white/95 p-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.085)] ${needsReview ? "border-orange-200/85 bg-[linear-gradient(135deg,rgba(255,122,0,0.035),rgba(255,255,255,0.96))]" : "border-emerald-200/85 bg-[linear-gradient(135deg,rgba(16,185,129,0.035),rgba(255,255,255,0.96))]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border ${colors.iconBox}`}>{colors.icon}</span>
          <div className="min-w-0 pt-0.5">
            <h4 className="line-clamp-2 text-[16px] font-black leading-[1.12] tracking-[-0.02em] text-slate-950">{item.subject}</h4>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SubjectMiniStat label="Questões" value={String(item.total)} />
          <SubjectMiniStat label="Acertos" value={String(item.correct)} tone="emerald" />
          <SubjectMiniStat label="Erros" value={String(item.wrong + item.blank)} tone={needsReview ? "red" : "slate"} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-slate-200/70">
          <div className={`h-full rounded-full bg-gradient-to-r ${progressGradient}`} style={{ width: `${Math.max(4, Math.min(100, item.percent))}%` }} />
        </div>
        <span className="w-[42px] text-right text-[13px] font-black text-slate-950">{formatPercent(item.percent)}%</span>
      </div>

      <div className="mt-3 flex-1">
        {needsReview ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-500">Tópicos para revisar</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.reviewTopics.length ? item.reviewTopics.map((topic) => <TopicChip key={topic.label} tone="red">{topic.label}</TopicChip>) : <TopicChip tone="red">Tópico não informado</TopicChip>}
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.07),rgba(255,255,255,0.94))] px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} />
              <div>
                <p className="text-[12px] font-black text-emerald-700">Ótimo desempenho!</p>
                <p className="mt-0.5 text-[12px] font-medium leading-5 text-slate-600">Você não errou nenhuma questão válida neste assunto.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function getSubjectVisual(subject: string, needsReview: boolean): { icon: ReactNode; iconBox: string } {
  const key = normalizeTextKey(subject);
  const baseOpacity = needsReview ? "" : "";
  if (key.includes("rede") || key.includes("internet") || key.includes("protocolo")) {
    return { icon: <Network size={22} />, iconBox: `border-orange-200 bg-orange-50 text-[#FF5A00] ${baseOpacity}` };
  }
  if (key.includes("hardware") || key.includes("periferico")) {
    return { icon: <Cpu size={22} />, iconBox: `border-blue-200 bg-blue-50 text-blue-600 ${baseOpacity}` };
  }
  if (key.includes("memoria") || key.includes("ram")) {
    return { icon: <Database size={22} />, iconBox: `border-violet-200 bg-violet-50 text-violet-600 ${baseOpacity}` };
  }
  if (key.includes("processador") || key.includes("cpu")) {
    return { icon: <Cpu size={22} />, iconBox: `border-rose-200 bg-rose-50 text-rose-600 ${baseOpacity}` };
  }
  if (key.includes("placa") || key.includes("motherboard")) {
    return { icon: <Monitor size={22} />, iconBox: `border-amber-200 bg-amber-50 text-amber-600 ${baseOpacity}` };
  }
  if (key.includes("armazenamento") || key.includes("ssd") || key.includes("hd")) {
    return { icon: <HardDrive size={22} />, iconBox: `border-teal-200 bg-teal-50 text-teal-700 ${baseOpacity}` };
  }
  if (key.includes("seguranca") || key.includes("firewall")) {
    return { icon: <CircleAlert size={22} />, iconBox: `border-red-200 bg-red-50 text-red-600 ${baseOpacity}` };
  }
  if (key.includes("sistema") || key.includes("windows") || key.includes("linux")) {
    return { icon: <Server size={22} />, iconBox: `border-sky-200 bg-sky-50 text-sky-600 ${baseOpacity}` };
  }
  return { icon: <BookOpen size={22} />, iconBox: `border-slate-200 bg-slate-50 text-slate-600 ${baseOpacity}` };
}

function SubjectMiniStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "red" }) {
  const cls = tone === "emerald" ? "border-emerald-200 bg-emerald-50/90 text-emerald-700" : tone === "red" ? "border-red-200 bg-red-50/90 text-red-600" : "border-slate-200 bg-white text-slate-700";
  return <span className={`inline-flex h-12 min-w-[64px] flex-col items-center justify-center rounded-[12px] border px-3 text-center shadow-[0_4px_10px_rgba(15,23,42,0.04)] ${cls}`}><strong className="text-[17px] font-black leading-none">{value}</strong><span className="mt-1 text-[8px] font-black uppercase tracking-[0.045em] opacity-70">{label}</span></span>;
}

function TopicChip({ children, tone }: { children: ReactNode; tone: "red" | "emerald" }) {
  return <span className={`inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-extrabold shadow-[0_4px_10px_rgba(239,68,68,0.055)] ${tone === "red" ? "border-red-200 bg-white/95 text-red-600" : "border-emerald-200 bg-white/95 text-emerald-700"}`}>{children}</span>;
}

function ResultBehavior({ result, metrics, timeSpent, avgTime }: { result: ResultPayload["result"]; metrics?: ResultPayload["behavior_metrics"]; timeSpent: number; avgTime: number }) {
  if (!result) return <EmptyState text="O comportamento desta tentativa ainda não está disponível." />;

  const totalQuestions = Math.max(1, Number(result.total_questions || 0));
  const screenExits = Number(metrics?.tab_switch_count || 0) + Number(metrics?.focus_violation_count || 0);
  const inactivityEvents = Number(metrics?.inactivity_event_count || 0);
  const focusEvents = screenExits + inactivityEvents;
  const answerChanges = Number(metrics?.total_answer_changes || 0);
  const decisionIndex = Number(metrics?.decision_index || 0);
  const scissorsCount = Number(metrics?.scissors_question_count || 0);
  const scissorsPercent = Number(metrics?.scissors_usage_percent || 0);
  const owlEnabled = Boolean(metrics?.owl_help_enabled);
  const owlUsed = Number(metrics?.owl_help_used_count || 0);
  const blankPercent = (Number(result.blank_count || 0) / totalQuestions) * 100;

  const focusLabel = focusEvents === 0 ? "Foco excelente" : focusEvents <= 2 ? "Foco aceitável" : "Foco comprometido";
  const focusTone = focusEvents === 0 ? "emerald" : focusEvents <= 2 ? "amber" : "red";
  const decisionLabel = decisionIndex <= 1 ? "Decisão firme" : decisionIndex <= 3 ? "Atenção" : "Hesitação";
  const decisionTone = decisionIndex <= 1 ? "emerald" : decisionIndex <= 3 ? "amber" : "red";
  const scissorsTone = scissorsPercent < 40 ? "amber" : "emerald";
  const owlTone = !owlEnabled ? "slate" : owlUsed > 0 ? "emerald" : "amber";
  const rhythmTone = avgTime <= 0 ? "slate" : avgTime <= 90 ? "emerald" : avgTime <= 180 ? "amber" : "red";

  const focusText = screenExits || inactivityEvents
    ? `Foram observadas ${screenExits} saída(s) de tela e ${inactivityEvents} período(s) de inatividade acima de 60 segundos.`
    : "Não foram observadas saídas de tela nem períodos relevantes de inatividade.";
  const blankText = blankPercent > 10
    ? "O percentual de questões em branco merece atenção, pois pode indicar insegurança em parte da prova."
    : "O número de questões em branco não foi um ponto dominante nesta tentativa.";
  const owlText = owlEnabled
    ? owlUsed > 0
      ? `A ajuda da Coruja foi utilizada ${owlUsed} vez(es), mostrando uso dos recursos de apoio disponíveis.`
      : "A ajuda da Coruja estava disponível neste simulado, mas não foi utilizada nesta tentativa."
    : "A ajuda da Coruja não estava disponível neste simulado.";

  return (
    <div className="space-y-3.5">
      <section className="relative mt-8 overflow-visible rounded-[18px] border border-orange-200/80 bg-[radial-gradient(circle_at_18%_50%,rgba(255,138,0,0.10),transparent_34%),radial-gradient(circle_at_72%_45%,rgba(255,138,0,0.055),transparent_30%),linear-gradient(135deg,#FFFFFF_0%,#FFFDF9_48%,#FFFFFF_100%)] px-5 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-6 lg:mt-10 lg:px-7">
        <div className="pointer-events-none absolute -left-1 -top-[78px] z-20 hidden h-[365px] w-[520px] lg:block 2xl:-left-3 2xl:-top-[92px] 2xl:h-[390px] 2xl:w-[560px]">
          <div className="absolute inset-x-8 bottom-0 h-[210px] rounded-full bg-[radial-gradient(circle_at_50%_60%,rgba(255,138,0,0.16),transparent_67%)] blur-[2px]" />
          <img src="/images/resultados/coruja_analista_comportamento_transparente.png" alt="Coruja do EstudoTOP analisando o comportamento da tentativa" className="absolute bottom-[-24px] left-0 h-[430px] max-w-none object-contain drop-shadow-[0_28px_30px_rgba(15,23,42,0.16)] 2xl:h-[462px]" />
        </div>
        <div className="grid min-h-[250px] items-center gap-6 lg:grid-cols-[500px_minmax(0,1fr)_410px] 2xl:grid-cols-[535px_minmax(0,1fr)_440px]">
          <div className="relative flex h-[250px] min-w-0 items-end justify-center overflow-hidden rounded-[16px] bg-[radial-gradient(circle_at_52%_62%,rgba(255,138,0,0.13),transparent_58%)] lg:h-[250px] lg:overflow-visible lg:bg-transparent">
            <img src="/images/resultados/coruja_analista_comportamento_transparente.png" alt="Coruja do EstudoTOP analisando o comportamento da tentativa" className="absolute bottom-[-190px] left-1/2 h-[520px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_24px_28px_rgba(15,23,42,0.13)] lg:hidden" />
          </div>
          <div className="relative z-10 max-w-[470px]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5A00]">Comportamento</p>
            <h3 className="mt-3 text-[26px] font-black leading-[1.10] tracking-[-0.035em] text-slate-950 md:text-[29px]">Como você se comportou durante a prova</h3>
            <div className="mt-4 space-y-2.5 text-[14px] font-medium leading-7 text-slate-600">
              <p>Além da nota, analisamos sinais da sua execução: foco, tomada de decisão, uso das ferramentas e ritmo de resolução.</p>
              <p>Esses dados ajudam a entender como você fez a prova e quais hábitos podem ser ajustados nas próximas tentativas.</p>
            </div>
          </div>
          <div className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
            <BehaviorExecutiveCard label="Foco" value={focusLabel} detail={focusEvents ? `${focusEvents} evento(s)` : "sem alertas"} tone={focusTone} icon={<Brain size={23} />} />
            <BehaviorExecutiveCard label="Ritmo médio" value={formatTime(avgTime)} detail="por questão" tone={rhythmTone} icon={<Clock3 size={23} />} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <BehaviorMetricCard title="Foco" value={focusLabel} tone={focusTone} detail={focusText} stats={[`Saídas: ${screenExits}`, `Inatividade: ${inactivityEvents}`]} />
        <BehaviorMetricCard title="Decisão" value={decisionLabel} tone={decisionTone} detail={`Foram registradas ${answerChanges} troca(s) de resposta, média de ${formatNumber(decisionIndex)} por questão.`} stats={[`Trocas: ${answerChanges}`, `${formatNumber(decisionIndex)}/questão`]} />
        <BehaviorMetricCard title="Tesourinha" value={`${scissorsCount} questão(ões)`} tone={scissorsTone} detail="A tesourinha ajuda em uma resolução mais organizada, pois permite eliminar alternativas improváveis antes de marcar a resposta." stats={[scissorsCount > 0 ? "recurso utilizado" : "sem uso"]} />
        <BehaviorMetricCard title="Ajuda da Coruja" value={owlEnabled ? `${owlUsed} uso(s)` : "Não disponível"} tone={owlTone} detail={owlText} stats={owlEnabled ? ["recurso disponível", owlUsed > 0 ? "utilizada" : "sem uso"] : ["não disponível"]} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[16px] border border-orange-200/80 bg-[linear-gradient(135deg,rgba(255,122,0,0.055),rgba(255,255,255,0.98))] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5A00]">Leitura da Coruja</p>
          <h4 className="mt-2 text-[21px] font-black tracking-[-0.03em] text-slate-950">O que os sinais mostram</h4>
          <p className="mt-3 text-sm font-medium leading-7 text-slate-600">{focusText} A média de resolução foi de <strong className="font-extrabold text-slate-950">{formatTime(avgTime)} por questão</strong>. {blankText}</p>
        </div>
        <div className="rounded-[16px] border border-slate-200/95 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Resumo de tempo</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoMetric label="Tempo total" value={formatTime(timeSpent)} />
            <InfoMetric label="Tempo por questão" value={`${formatTime(avgTime)} /questão`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function BehaviorExecutiveCard({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: "emerald" | "amber" | "red" | "slate"; icon: ReactNode }) {
  const styles = behaviorToneStyles(tone);
  return <div className={`min-h-[104px] rounded-[16px] border p-4 shadow-[0_10px_22px_rgba(15,23,42,0.055)] ${styles.card}`}><div className="flex items-center gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${styles.icon}`}>{icon}</span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 text-[19px] font-black leading-tight tracking-[-0.03em] text-slate-950">{value}</p><p className={`mt-1 text-[13px] font-bold ${styles.text}`}>{detail}</p></div></div></div>;
}

function BehaviorMetricCard({ title, value, detail, stats, tone }: { title: string; value: string; detail: string; stats: string[]; tone: "emerald" | "amber" | "red" | "slate" }) {
  const styles = behaviorToneStyles(tone);
  return <article className={`rounded-[16px] border p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] ${styles.card}`}><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{title}</p><h4 className="mt-2 text-[21px] font-black tracking-[-0.03em] text-slate-950">{value}</h4><p className="mt-3 min-h-[72px] text-sm font-medium leading-6 text-slate-600">{detail}</p><div className="mt-4 flex flex-wrap gap-2">{stats.map((stat) => <span key={stat} className={`rounded-full border px-3 py-1 text-[11px] font-extrabold ${styles.pill}`}>{stat}</span>)}</div></article>;
}

function behaviorToneStyles(tone: "emerald" | "amber" | "red" | "slate") {
  if (tone === "emerald") return { card: "border-emerald-200/80 bg-[linear-gradient(135deg,rgba(16,185,129,0.065),rgba(255,255,255,0.96))]", icon: "bg-emerald-100/80 text-emerald-600", text: "text-emerald-700", pill: "border-emerald-200 bg-white/90 text-emerald-700" };
  if (tone === "red") return { card: "border-red-200/80 bg-[linear-gradient(135deg,rgba(239,68,68,0.065),rgba(255,255,255,0.96))]", icon: "bg-red-100/80 text-red-600", text: "text-red-600", pill: "border-red-200 bg-white/90 text-red-600" };
  if (tone === "amber") return { card: "border-orange-200/80 bg-[linear-gradient(135deg,rgba(255,122,0,0.065),rgba(255,255,255,0.96))]", icon: "bg-orange-100/80 text-[#FF5A00]", text: "text-[#FF5A00]", pill: "border-orange-200 bg-white/90 text-[#FF5A00]" };
  return { card: "border-slate-200/90 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))]", icon: "bg-slate-100 text-slate-500", text: "text-slate-500", pill: "border-slate-200 bg-white text-slate-600" };
}

function ResultCorrectionVideo({ correctionVideoUrl }: { correctionVideoUrl: string }) {
  const embed = getCorrectionVideoEmbed(correctionVideoUrl);
  if (!embed) return <EmptyState text="O vídeo de correção desta tentativa ainda não está disponível." />;

  return (
    <div className="space-y-5">
      <section className="relative overflow-visible rounded-[24px] border border-slate-200/95 bg-[linear-gradient(135deg,#FFFFFF_0%,#FFFDF9_48%,#FFFFFF_100%)] px-5 pb-7 pt-8 shadow-[0_16px_42px_rgba(15,23,42,0.065)] md:px-7 md:pb-8 lg:min-h-[660px] lg:px-8 lg:pb-10 lg:pt-11 xl:min-h-[690px]">
        <div className="pointer-events-none absolute left-[12px] top-[108px] hidden h-[390px] w-[390px] rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.15),transparent_68%)] blur-[5px] lg:block" />
        <div className="pointer-events-none absolute -left-7 bottom-[22px] z-20 hidden h-[560px] w-[390px] lg:block xl:-left-9 xl:bottom-[18px] xl:h-[600px] xl:w-[420px] 2xl:-left-10 2xl:h-[630px] 2xl:w-[450px]">
          <div className="absolute inset-x-10 bottom-8 h-20 rounded-full bg-slate-900/10 blur-2xl" />
          <img
            src="/images/resultados/coruja-correcao.png"
            alt="Coruja do EstudoTOP acompanhando o vídeo de correção"
            className="absolute bottom-0 left-1/2 h-[560px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_30px_34px_rgba(15,23,42,0.16)] xl:h-[600px] 2xl:h-[630px]"
          />
        </div>

        <div className="grid gap-7 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="relative flex h-[310px] items-end justify-center overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_50%_62%,rgba(255,138,0,0.12),transparent_58%)] lg:h-auto lg:bg-transparent">
            <img
              src="/images/resultados/coruja-correcao.png"
              alt="Coruja do EstudoTOP acompanhando o vídeo de correção"
              className="absolute bottom-[-120px] left-1/2 h-[460px] max-w-none -translate-x-1/2 object-contain drop-shadow-[0_24px_28px_rgba(15,23,42,0.13)] lg:hidden"
            />
          </div>

          <div className="relative z-10 min-w-0">
            <div className="max-w-[620px]">
              <h3 className="text-[30px] font-black leading-[1.08] tracking-[-0.045em] text-slate-950 md:text-[35px] xl:text-[38px]">
                Assista à correção comentada deste simulado
              </h3>
              <p className="mt-4 max-w-[540px] text-[15px] font-medium leading-7 text-slate-500">
                Acompanhe a resolução em vídeo com uma experiência premium e aprimore seus resultados.
              </p>
            </div>

            <div className="mt-7 max-w-[1060px] rounded-[24px] border border-slate-900/90 bg-[linear-gradient(180deg,#111827_0%,#020617_100%)] p-3 shadow-[0_28px_60px_rgba(2,6,23,0.28),0_12px_28px_rgba(255,90,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)] md:p-3.5 xl:p-4">
              <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#0B1120] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="aspect-video w-full">
                  {embed.kind === "html5" ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      controlsList="nodownload noplaybackrate"
                      className="h-full w-full bg-slate-950 object-contain"
                    >
                      <source src={embed.src} />
                      Seu navegador não suporta a reprodução deste vídeo.
                    </video>
                  ) : (
                    <iframe
                      src={embed.src}
                      title="Vídeo de correção do simulado"
                      className="h-full w-full bg-slate-950"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <VideoInsightCard
          icon={<Monitor size={30} />}
          tone="orange"
          title="Assista com atenção"
          description="Foque na explicação do professor e nos detalhes importantes."
        />
        <VideoInsightCard
          icon={<CircleAlert size={30} />}
          tone="orange"
          title="Entenda seus erros"
          description="Veja onde errou e compreenda a lógica por trás da correta."
        />
        <VideoInsightCard
          icon={<FileText size={30} />}
          tone="violet"
          title="Anote as dicas"
          description="Registre os insights e estratégias para revisar depois."
        />
      </section>
    </div>
  );
}

function VideoInsightCard({ icon, title, description, tone }: { icon: ReactNode; title: string; description: string; tone: "orange" | "violet" }) {
  const styles = tone === "violet"
    ? {
      card: "border-violet-100/95 bg-white/96 shadow-[0_12px_28px_rgba(15,23,42,0.055)]",
      icon: "border-violet-200/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#F6F0FF_100%)] text-violet-600 shadow-[0_12px_24px_rgba(139,92,246,0.10)]",
    }
    : {
      card: "border-slate-200/95 bg-white/96 shadow-[0_12px_28px_rgba(15,23,42,0.055)]",
      icon: "border-orange-200/80 bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF2E8_100%)] text-[#FF5A00] shadow-[0_12px_24px_rgba(255,90,0,0.12)]",
    };

  return (
    <article className={`group relative min-h-[150px] overflow-hidden rounded-[20px] border p-7 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.075)] ${styles.card}`}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-slate-100/70 blur-3xl" />
      <div className="relative flex items-center gap-7">
        <span className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border ${styles.icon}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h4 className="text-[18px] font-black leading-tight tracking-[-0.02em] text-slate-950">{title}</h4>
          <p className="mt-2 max-w-[340px] text-[14px] font-medium leading-6 text-slate-500">{description}</p>
        </div>
      </div>
    </article>
  );
}

function ResultQuestions({ questions, showAnswerKey, showTeacherComment }: { questions: ResultQuestion[]; showAnswerKey: boolean; showTeacherComment: boolean }) {
  if (!showAnswerKey) return <LockedResult />;
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Questões comentadas</p><h3 className="mt-2 text-2xl font-black text-slate-950">Questões do simulado</h3><div className="mt-6 space-y-5">{questions.map((question, index) => { const selected = question.alternatives.find((alt) => alt.id === question.selected_alternative_id); const correct = question.alternatives.find((alt) => alt.is_correct); const isWrongTFAnswer = question.question_type === "true_false" && (correct?.label === "E" || String(correct?.text || "").trim().toLowerCase() === "errado"); return <div key={question.simulado_question_id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Questão {index + 1}</span>{question.subject && <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">{question.subject}</span>}</div><div className="richtext-editor mt-4 max-w-none rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4 text-sm leading-6" dangerouslySetInnerHTML={{ __html: richHtml(question.statement) }} /><div className="mt-4 space-y-2">{question.alternatives.map((alt) => { const wrongTF = question.question_type === "true_false" && alt.is_correct && (alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado"); return <div key={alt.id} className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${wrongTF ? "border-red-300 bg-red-50 text-red-900" : alt.is_correct ? "border-emerald-300 bg-emerald-50 text-emerald-900" : selected?.id === alt.id ? "border-red-300 bg-red-50 text-red-900" : "border-slate-200 bg-white text-slate-800"}`}><strong className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${wrongTF ? "bg-red-500 text-white" : alt.is_correct ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{alt.is_correct ? OWL_MARK : question.question_type === "true_false" ? "" : alt.label}</strong><span className="richtext-editor min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: richHtml(alt.text) }} /></div>; })}</div><div className={`mt-4 rounded-2xl border p-3 text-sm font-semibold ${isWrongTFAnswer ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>Gabarito: {correct ? (question.question_type === "true_false" ? correct.text : `Alternativa ${correct.label}`) : "Sem gabarito"}</div><div className="mt-4 grid gap-2 text-sm md:grid-cols-2"><InfoLine label="Sua resposta" value={selected ? (question.question_type === "true_false" ? selected.text : `Alternativa ${selected.label}`) : "Em branco"} /><InfoLine label="Resultado" value={!selected ? "Em branco" : selected.is_correct ? "Acertou" : "Errou"} /></div>{question.explanation_text && showTeacherComment && <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm"><strong>Comentário do professor:</strong><div className="richtext-editor mt-2 max-w-none" dangerouslySetInnerHTML={{ __html: richHtml(question.explanation_text) }} /></div>}</div>; })}</div></div>;
}

function PremiumDonut({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 52;
  const dash = Math.max(0, Math.min(100, percent));
  return (
    <div className="mx-auto flex flex-col items-center">
      <div className="relative h-[150px] w-[150px]">
        <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90 drop-shadow-[0_10px_18px_rgba(255,122,0,0.14)]">
          <circle cx="75" cy="75" r="52" fill="none" stroke="#F1EDE8" strokeWidth="10" />
          <circle cx="75" cy="75" r="52" fill="none" stroke="url(#studentResultGradient)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(dash / 100) * circumference} ${circumference}`} />
          <defs><linearGradient id="studentResultGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FF7A00" /><stop offset="100%" stopColor="#FFC400" /></linearGradient></defs>
        </svg>
        <div className="absolute inset-0 m-auto flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-white/90 text-center">
          <span className="text-[25px] font-extrabold leading-none tracking-[-0.03em] text-slate-950">{formatPercent(percent)}%</span>
          <span className="mt-1.5 text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-600">aproveitamento</span>
        </div>
      </div>
    </div>
  );
}


function MiniResultMetric({ tone, icon, label, value, detail, chart }: { tone: "emerald" | "red" | "slate" | "violet"; icon: ReactNode; label: string; value: string; detail: string; chart: "bars" | "line" }) {
  const toneMap = {
    emerald: {
      wrapper: "border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.92))] text-emerald-600",
      detail: "text-emerald-600",
      soft: "bg-emerald-500/12",
      chart: "bg-emerald-400/45",
      stroke: "#10B981",
      fill: "rgba(16,185,129,0.13)",
    },
    red: {
      wrapper: "border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.96),rgba(255,255,255,0.92))] text-red-500",
      detail: "text-red-500",
      soft: "bg-red-500/12",
      chart: "bg-red-400/45",
      stroke: "#EF4444",
      fill: "rgba(239,68,68,0.12)",
    },
    slate: {
      wrapper: "border-slate-200/90 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.94))] text-slate-500",
      detail: "text-slate-500",
      soft: "bg-slate-500/10",
      chart: "bg-slate-300/80",
      stroke: "#94A3B8",
      fill: "rgba(148,163,184,0.14)",
    },
    violet: {
      wrapper: "border-violet-200/80 bg-[linear-gradient(135deg,rgba(245,243,255,0.96),rgba(255,255,255,0.92))] text-violet-600",
      detail: "text-slate-700",
      soft: "bg-violet-500/12",
      chart: "bg-violet-400/45",
      stroke: "#8B5CF6",
      fill: "rgba(139,92,246,0.14)",
    },
  }[tone];
  const barHeights = [18, 28, 22, 38, 30, 46, 58];

  return (
    <div className={`flex min-h-[104px] items-center justify-between gap-3 rounded-[18px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.72)] ${toneMap.wrapper}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneMap.soft}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-slate-700">{label}</p>
          <p className="mt-1 text-[24px] font-extrabold leading-none tracking-[-0.03em] text-slate-950">{value}</p>
          <p className={`mt-1 text-[12px] font-extrabold ${toneMap.detail}`}>{detail}</p>
        </div>
      </div>
      <div className="hidden h-16 w-[86px] shrink-0 items-end justify-end sm:flex">
        {chart === "bars" ? (
          <div className="flex h-full items-end gap-1.5 opacity-80">
            {barHeights.map((height, index) => <span key={index} className={`w-1.5 rounded-t-full ${toneMap.chart}`} style={{ height }} />)}
          </div>
        ) : (
          <svg viewBox="0 0 92 58" className="h-[58px] w-[92px] overflow-visible">
            <path d="M6 48 C18 32, 24 36, 32 28 S48 36, 56 22 S70 12, 86 18" fill="none" stroke={toneMap.stroke} strokeWidth="3" strokeLinecap="round" />
            <path d="M6 48 C18 32, 24 36, 32 28 S48 36, 56 22 S70 12, 86 18 L86 56 L6 56 Z" fill={toneMap.fill} />
            <circle cx="86" cy="18" r="3" fill={toneMap.stroke} />
          </svg>
        )}
      </div>
    </div>
  );
}


function XRayMetric({ tone, icon, label, value, detail, mini }: { tone: "emerald" | "red" | "amber" | "violet" | "blue" | "orange" | "slate"; icon: ReactNode; label: string; value: string; detail: string; mini: "bars" | "line" }) {
  const toneMap = {
    emerald: { wrap: "border-emerald-200 bg-emerald-50/70 text-emerald-600", soft: "bg-emerald-500/12", chart: "bg-emerald-400/45", stroke: "#10B981", fill: "rgba(16,185,129,0.12)" },
    red: { wrap: "border-red-200 bg-red-50/70 text-red-500", soft: "bg-red-500/12", chart: "bg-red-400/45", stroke: "#EF4444", fill: "rgba(239,68,68,0.12)" },
    amber: { wrap: "border-amber-200 bg-amber-50/75 text-amber-600", soft: "bg-amber-500/14", chart: "bg-amber-400/55", stroke: "#F59E0B", fill: "rgba(245,158,11,0.13)" },
    violet: { wrap: "border-violet-200 bg-violet-50/70 text-violet-600", soft: "bg-violet-500/12", chart: "bg-violet-400/45", stroke: "#8B5CF6", fill: "rgba(139,92,246,0.13)" },
    blue: { wrap: "border-blue-200 bg-blue-50/70 text-blue-600", soft: "bg-blue-500/12", chart: "bg-blue-400/45", stroke: "#2563EB", fill: "rgba(37,99,235,0.12)" },
    orange: { wrap: "border-orange-200 bg-orange-50/70 text-orange-600", soft: "bg-orange-500/12", chart: "bg-orange-400/50", stroke: "#FF5A00", fill: "rgba(255,90,0,0.12)" },
    slate: { wrap: "border-slate-200 bg-slate-50/80 text-slate-500", soft: "bg-slate-500/10", chart: "bg-slate-300/90", stroke: "#64748B", fill: "rgba(100,116,139,0.12)" },
  }[tone];
  const bars = ["h-3.5", "h-6", "h-4", "h-8", "h-6", "h-10"];

  return (
    <div className={`flex h-full min-h-[96px] items-center justify-between gap-3 rounded-[14px] border px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.035),inset_0_1px_0_rgba(255,255,255,0.72)] ${toneMap.wrap}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneMap.soft}`}>{icon}</span>
        <div className="min-w-0">
          <p className="min-h-[26px] text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-slate-500">{label}</p>
          <p className="mt-1 whitespace-nowrap text-[22px] font-extrabold leading-none tracking-[-0.03em] text-slate-950">{value}</p>
          <p className="mt-1 whitespace-nowrap text-[12px] font-bold text-slate-500">{detail}</p>
        </div>
      </div>
      <div className="hidden h-12 w-[54px] shrink-0 items-end justify-end 2xl:flex">
        {mini === "bars" ? (
          <div className="flex h-full items-end gap-1.5 opacity-75">
            {bars.map((height, index) => <span key={index} className={`w-1.5 rounded-t-full ${height} ${toneMap.chart}`} />)}
          </div>
        ) : (
          <svg viewBox="0 0 62 42" className="h-[42px] w-[62px] overflow-visible">
            <path d="M4 34 C12 24, 18 27, 24 20 S36 25, 42 15 S52 8, 58 12" fill="none" stroke={toneMap.stroke} strokeWidth="3" strokeLinecap="round" />
            <path d="M4 34 C12 24, 18 27, 24 20 S36 25, 42 15 S52 8, 58 12 L58 40 L4 40 Z" fill={toneMap.fill} />
          </svg>
        )}
      </div>
    </div>
  );
}


function ResultSimuladoPdf({ payload }: { payload: ResultPayload }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canExport = payload.gabarito.length > 0;

  const handleDownload = async () => {
    if (!canExport || isGenerating) return;
    setIsGenerating(true);
    setMessage(null);

    try {
      const { downloadSimuladoResultPdf } = await import("@/app/lib/pdf/simulado-result-pdf");
      await downloadSimuladoResultPdf({
        meta: {
          title: payload.simulado.title,
          scoring_model: payload.simulado.scoring_model,
        },
        student: {
          name: payload.student?.name ?? null,
          email: payload.student?.email ?? null,
          cpf: payload.student?.cpf ?? null,
        },
        result: payload.result
          ? {
              displayScore: payload.result.display_score,
              maxScore: payload.result.max_score,
              percentage: payload.result.display_percentage,
              correct: payload.result.correct_count,
              wrong: payload.result.wrong_count,
              blank: payload.result.blank_count,
            }
          : { displayScore: 0, maxScore: 0, percentage: 0, correct: 0, wrong: 0, blank: 0 },
        questions: payload.gabarito.map((question) => ({
          order_number: question.order_number,
          statement: question.statement,
          subject: question.subject,
          alternatives: question.alternatives.map((alternative) => ({
            id: alternative.id,
            label: alternative.label,
            text: alternative.text,
            is_correct: alternative.is_correct,
          })),
          simulado_question_id: question.simulado_question_id,
        })),
        answers: Object.fromEntries(
          payload.gabarito.map((question) => [
            question.simulado_question_id,
            {
              alternativeId: question.selected_alternative_id ?? undefined,
              label: question.selected_alternative_label ?? undefined,
              isCorrect: question.is_correct,
            },
          ]),
        ),
        timeSpent: payload.result?.time_spent_seconds ?? payload.attempt.time_spent_seconds ?? 0,
      });
    } catch (error) {
      console.error("Erro ao gerar PDF do simulado", error);
      setMessage("Não foi possível gerar o PDF agora. Tente novamente em instantes.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#FFFFFF,#FFF8EF_48%,#FFFFFF)] p-8 text-center shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-500"><FileText size={28} /></div>
      <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF5A00]">Material de revisão</p>
      <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-slate-950">PDF do Simulado</h3>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        Baixe o PDF com as questões deste simulado para revisar com mais calma, estudar offline ou guardar o material como apoio à sua preparação.
      </p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={!canExport || isGenerating}
        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-orange-400/40 bg-gradient-to-r from-[#FF5A00] to-[#FF8A00] px-6 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(255,90,0,0.24),inset_0_1px_0_rgba(255,255,255,0.30)] transition duration-200 hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FileText size={17} /> {isGenerating ? "Gerando PDF..." : "Baixar PDF do Simulado"}
      </button>
      {!canExport && <p className="mx-auto mt-4 max-w-xl text-xs font-semibold leading-6 text-amber-700">O PDF fica disponível quando o gabarito/revisão das questões está liberado para esta tentativa.</p>}
      {message && <p className="mx-auto mt-4 max-w-xl text-xs font-semibold leading-6 text-red-600">{message}</p>}
    </div>
  );
}


function XRayInfoLine({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="grid min-h-10 grid-cols-[minmax(120px,0.42fr)_minmax(0,0.58fr)] items-center gap-3 border border-slate-200 bg-white px-4 py-2 first:rounded-t-[10px] last:rounded-b-[10px]">
      <p className="inline-flex min-w-0 items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
        <span className="text-slate-500">{icon}</span>
        {label}
      </p>
      <p className="min-w-0 text-sm font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-1 font-extrabold text-slate-950">{value}</p></div>;
}

function InfoMetric({ label, value, tone = "slate", icon }: { label: string; value: string; tone?: "blue" | "violet" | "slate"; icon?: ReactNode }) {
  const toneCls = tone === "blue"
    ? "border-blue-100 bg-[linear-gradient(135deg,rgba(59,130,246,0.055),#FFFFFF)] text-blue-600"
    : tone === "violet"
      ? "border-violet-100 bg-[linear-gradient(135deg,rgba(139,92,246,0.055),#FFFFFF)] text-violet-600"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <div className={`flex min-h-[112px] items-center gap-4 rounded-[16px] border p-5 shadow-[0_8px_18px_rgba(15,23,42,0.025)] ${toneCls}`}>
      {icon && <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-current/10">{icon}</span>}
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-2 text-[22px] font-extrabold text-slate-950">{value}</p>
      </div>
    </div>
  );
}
function EmptyState({ text }: { text: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">{text}</div>; }
function LockedResult() { return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">O gabarito e os detalhes por questão não estão disponíveis para este simulado.</div>; }
