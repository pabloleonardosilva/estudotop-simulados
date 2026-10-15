"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, CreditCard, Filter, Link2, Package, RefreshCw, ScrollText, X } from "lucide-react";
import PageBackground from "@/app/components/ui/PageBackground";
import PageHeader from "@/app/components/ui/PageHeader";
import MetricCard from "@/app/components/ui/MetricCard";
import PremiumCard from "@/app/components/ui/PremiumCard";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumModal from "@/app/components/ui/PremiumModal";
import { sortTextOptions } from "@/app/lib/utils/sort";
import { adminFetch } from "@/lib/supabase/adminFetch";

type Destination = { id: string; title?: string; name?: string; status: string };
type Mapping = { id: string; hotmart_product_ucode: string; hotmart_product_name: string; destination_type: string; status: string; jornadas?: { title?: string } | null; simulado_events?: { name?: string } | null };
type Transaction = { id: string; transaction_code: string; hotmart_product_ucode: string; product_name_snapshot: string; buyer_email: string; buyer_document?: string | null; buyer_phone?: string | null; purchase_status: string; purchase_approved_at?: string | null; purchase_created_at?: string | null; processing_status: string; processing_error_code?: string | null; processing_error_message?: string | null; refund_request_state?: string | null; amount: number | null; currency: string | null; created_at: string; destination_type: string | null; possible_duplicate_student_id?: string | null; resolved_at?: string | null; jornadas?: { title?: string; duration_days?: number | null; duration_months?: number | null } | null; simulado_events?: { name?: string } | null; students?: { name?: string; email?: string } | null; possible_duplicate?: { name?: string; email?: string } | null; hotmart_access_links?: Array<{ current_origin: string; access_state: string; access_started_at?: string | null; access_expires_at?: string | null; student_jornadas?: { started_at?: string; expires_at?: string; status?: string } | null; simulado_event_participants?: { access_status?: string } | null }> };
type History = { id: string; action: string; actor_type: string; created_at: string };
type Readiness = { hottok: boolean; client_id: boolean; client_secret: boolean; basic_token: boolean; environment: "sandbox" | "production" | null; resend: boolean; registration_token_secret: boolean };
type Data = { configured: boolean; readiness: Readiness; mappings: Mapping[]; transactions: Transaction[]; history: History[] };

const emptyReadiness: Readiness = { hottok: false, client_id: false, client_secret: false, basic_token: false, environment: null, resend: false, registration_token_secret: false };

// Espelha HOTMART_COMMERCIAL_PROCESSING_ELIGIBLE de app/lib/server/hotmart/processor.ts (módulo
// server-only, não importável aqui). Usado só para decidir se "Vincular e reprocessar" deve ser
// oferecido no modal — nunca para acionar reprocessamento por conta própria.
const HOTMART_REPROCESS_ELIGIBLE_STATUSES = ["received", "pending_mapping", "pending_destination", "processing_error", "refund_reconciliation_required"];

function processingStatusLabel(status: string, refundRequestState?: string | null, errorCode?: string | null) {
  if (refundRequestState === "reconciliation_required") return "Pedido de reembolso recebido";
  if (errorCode === "COMMERCIAL_DATE_REQUIRES_REVIEW") return "Data da compra requer verificação";
  const labels: Record<string, string> = {
    pending_mapping: "Aguardando vínculo com Jornada ou Evento",
    pending_destination: "Destino indisponível para concessão",
    pending_duplicate_purchase: "Compra duplicada aguardando decisão",
    pending_duplicate_student: "Possível cadastro duplicado",
    processing_error: "Falha no processamento",
    refund_reconciliation_required: "Pedido de reembolso recebido",
  };
  return labels[status] || status;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function calculatedCommercialExpiration(item: Transaction) {
  if (!item.purchase_approved_at || !item.jornadas) return null;
  const durationDays = Number(item.jornadas.duration_days || Number(item.jornadas.duration_months || 0) * 30);
  const expires = new Date(item.purchase_approved_at);
  if (!durationDays || Number.isNaN(expires.getTime())) return null;
  expires.setUTCDate(expires.getUTCDate() + durationDays);
  return expires.toISOString();
}

function purchaseStatusLabel(status: string) {
  const labels: Record<string, string> = {
    APPROVED: "Compra aprovada",
    COMPLETE: "Compra concluída",
    DELAYED: "Pagamento em atraso",
    DISPUTE: "Pedido de reembolso recebido",
    REFUNDED: "Reembolso confirmado",
    CHARGEBACK: "Chargeback confirmado",
    CANCELED: "Compra cancelada",
    EXPIRED: "Compra expirada",
  };
  return labels[status.toUpperCase()] || status;
}

function purchaseStatusTone(status: string) {
  const upper = status.toUpperCase();
  if (["APPROVED", "COMPLETE"].includes(upper)) return "success";
  if (["REFUNDED", "CHARGEBACK", "CANCELED", "EXPIRED"].includes(upper)) return "danger";
  if (["DELAYED", "DISPUTE"].includes(upper)) return "warning";
  return "neutral";
}

function processingStatusTone(status: string, refundRequestState?: string | null, errorCode?: string | null) {
  if (status === "processed") return "success";
  if (refundRequestState === "reconciliation_required" || errorCode === "COMMERCIAL_DATE_REQUIRES_REVIEW") return "warning";
  if (status === "blocked_financial" || status === "processing_error") return "danger";
  if (status.startsWith("pending")) return "warning";
  return "neutral";
}

function accessStateLabel(status?: string | null) {
  const labels: Record<string, string> = { active: "Ativo", paused: "Pausado", cancelled: "Cancelado" };
  return status ? labels[status] || status : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
  const timePart = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(date);
  return `${datePart} às ${timePart}`;
}

function formatCurrencyAmount(amount: number | null, currency: string | null) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount)) || !currency) return null;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatPlainAmount(amount: number | null) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return null;
  return Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type TransactionFilters = {
  buyer: string;
  code: string;
  product: string;
  destinationType: "all" | "jornada" | "event" | "unlinked";
  destinationName: string;
  dateFrom: string;
  dateTo: string;
};

const emptyTransactionFilters: TransactionFilters = { buyer: "", code: "", product: "", destinationType: "all", destinationName: "", dateFrom: "", dateTo: "" };

// Espelha exatamente a derivação de estado de renderTransactionCard (linkState pelo hotmart_product_ucode
// do PRODUTO, nunca por transação) — duplicado aqui, e não extraído para dentro de renderTransactionCard,
// para preservar intacto o card legado de Pendências/Duplicidades e as asserções de string que o travam em
// scripts/test-hotmart-unit.cjs. Mesma regra já homologada; nenhuma regra nova.
function deriveTransactionFlags(transaction: Transaction, mappings: Mapping[]) {
  const activeMapping = mappings.find((candidate) => candidate.hotmart_product_ucode === transaction.hotmart_product_ucode && candidate.status === "active");
  const anyMapping = mappings.find((candidate) => candidate.hotmart_product_ucode === transaction.hotmart_product_ucode);
  const destinationName = activeMapping ? (activeMapping.jornadas?.title || activeMapping.simulado_events?.name) : null;
  const destinationTypeLabel = activeMapping?.destination_type === "event" ? "Evento" : "Jornada";
  const linkState: "linked" | "destination_unavailable" | "mapping_inactive" | "unlinked" =
    activeMapping && destinationName ? "linked"
      : activeMapping ? "destination_unavailable"
      : anyMapping ? "mapping_inactive"
      : "unlinked";
  const canLink = linkState === "unlinked";
  const canReprocess = transaction.processing_status.startsWith("pending") && (transaction.processing_status !== "pending_mapping" || Boolean(activeMapping));
  const canExtend = transaction.processing_status === "pending_duplicate_purchase" && transaction.destination_type === "jornada";
  const canRefund = transaction.processing_status.startsWith("pending");
  const awaitingDestinationCopy = linkState === "unlinked" && (transaction.processing_status === "pending_mapping" || transaction.processing_status === "pending_destination");
  const situationLabel = awaitingDestinationCopy ? "Aguardando definição de destino" : processingStatusLabel(transaction.processing_status, transaction.refund_request_state, transaction.processing_error_code);
  const situationHelper = awaitingDestinationCopy ? "Vincule este produto a uma Jornada ou Evento para permitir o processamento." : null;
  return { activeMapping, anyMapping, destinationName, destinationTypeLabel, linkState, canLink, canReprocess, canExtend, canRefund, situationLabel, situationHelper };
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="et-admin-dark-divider border-t pt-4 first:border-t-0 first:pt-0"><p className="et-admin-dark-label">{label}</p><div className="mt-2 space-y-1.5">{children}</div></div>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm"><span className="shrink-0 text-slate-500">{label}</span><span className="et-admin-dark-text text-right font-medium">{value}</span></div>;
}

// PremiumSelect (variant="jornada") usa um elemento select nativo do HTML por baixo: appearance-none
// só maquia o campo FECHADO — a lista ABERTA continua sendo o menu nativo do navegador/SO (branco/azul
// no Windows), fora de qualquer controle de CSS. Não dá para "consertar" isso por cima do elemento nativo. Substituído
// por um dropdown 100% customizado, no mesmo padrão já existente e aprovado em
// app/questoes/revisar/page-client.tsx (SimpleSelectDropdown): botão dark premium + painel próprio
// com hover/selected/scroll controláveis. Local a este arquivo, não altera PremiumSelect nem
// nenhuma outra tela. O painel é portado para document.body (mesma técnica já usada em
// EvaluatedTopicsInput) para nunca depender de overflow/stacking context de nenhum ancestral.
function HotmartDropdown({ label, value, onChange, options, disabled = false, sort = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  sort?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const sortedOptions = sort ? sortTextOptions(options) : options;

  useLayoutEffect(() => {
    if (!open) return;
    function updateRect() {
      const node = triggerRef.current;
      if (!node) return;
      const bounds = node.getBoundingClientRect();
      setMenuRect({ top: bounds.bottom + 6, left: bounds.left, width: bounds.width });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const currentLabel = sortedOptions.find((option) => option.value === value)?.label || label;

  return <div ref={triggerRef} className="relative">
    <label className="et-admin-dark-label mb-2 flex items-center gap-2">{label}</label>
    <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className={`et-admin-dark-input flex h-12 w-full items-center justify-between gap-2 px-4 text-left text-sm outline-none transition focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10 ${open ? "border-orange-400/50 ring-4 ring-orange-500/10" : ""} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <span className="truncate text-white">{currentLabel}</span>
      <ChevronDown size={16} className={`shrink-0 transition ${open ? "rotate-180 text-orange-300" : "text-slate-500"}`} />
    </button>
    {open && menuRect ? createPortal(
      <div ref={menuRef} style={{ position: "fixed", top: menuRect.top, left: menuRect.left, width: menuRect.width }} className="et-admin-dark-panel z-[9999] max-h-72 overflow-y-auto p-2">
        {sortedOptions.map((option) => {
          const selected = option.value === value;
          return <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }}
            className={selected
              ? "flex w-full items-center justify-between gap-2 rounded-xl border border-orange-500/30 bg-orange-500/[0.12] px-4 py-2.5 text-left text-sm font-semibold text-orange-100"
              : "flex w-full items-center justify-between gap-2 rounded-xl border border-transparent px-4 py-2.5 text-left text-sm font-semibold text-slate-300 transition hover:border-white/[0.07] hover:bg-white/[0.05] hover:text-white"}>
            <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
            {selected ? <Check size={14} className="shrink-0 text-orange-400" strokeWidth={3} /> : null}
          </button>;
        })}
      </div>,
      document.body,
    ) : null}
  </div>;
}

type CatalogProduct = { name: string; ucode: string };

function normalizeCatalogSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// PremiumModal não oferece Escape, clique no backdrop, role="dialog" nem rolagem interna da lista;
// por isso o catálogo usa um modal local, portado para document.body acima de sidebar/header.
// A busca filtra só a lista já carregada — nenhuma nova chamada à Hotmart por caractere.
function HotmartCatalogModal({ source, products, loading, error, copiedUcode, copyFailedUcode, onCopy, onUse, onClose }: {
  source: "sandbox" | "production";
  products: CatalogProduct[] | null;
  loading: boolean;
  error: string;
  copiedUcode: string;
  copyFailedUcode: string;
  onCopy: (ucode: string) => void;
  onUse: (product: CatalogProduct) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const isProduction = source === "production";
  const titleId = `hotmart-catalog-title-${source}`;
  const term = normalizeCatalogSearch(search);
  const filteredProducts = (products || []).filter((product) => !term || normalizeCatalogSearch(product.name).includes(term) || product.ucode.toLowerCase().includes(term));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-4 font-sans backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="et-admin-dark-panel relative flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden text-white">
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${isProduction ? "from-amber-500 via-amber-300 to-yellow-200" : "from-orange-600 via-amber-400 to-yellow-300"}`} />
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-7">
          <div className="min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${isProduction ? "text-amber-300" : "text-slate-400"}`}>{isProduction ? "Produção" : "Sandbox"}</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{isProduction ? "Meus produtos Hotmart" : "Produtos Hotmart — Sandbox"}</h2>
            <p className="mt-1.5 text-sm text-slate-400">{isProduction ? "Catálogo real da conta Hotmart, somente leitura. Nenhuma venda, acesso ou configuração será alterada." : "Catálogo fictício de homologação."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar catálogo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="shrink-0 px-5 pb-3 sm:px-7">
          <PremiumInput variant="jornada" autoFocus aria-label="Buscar produto pelo nome" placeholder="Buscar produto pelo nome..." value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} />
          {products && products.length ? <p className="mt-2 text-xs text-slate-500">{filteredProducts.length} de {products.length} {products.length === 1 ? "produto" : "produtos"}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.065] px-5 py-4 sm:px-7">
          {loading ? <p className="et-admin-dark-muted text-sm" role="status">Buscando produtos na Hotmart...</p>
            : error ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>
            : products && !products.length ? <p className="et-admin-dark-muted text-sm">{isProduction ? "Nenhum produto foi retornado pela conta Hotmart de produção." : "Nenhum produto foi retornado pela API Hotmart neste ambiente."}</p>
            : products && !filteredProducts.length ? <p className="et-admin-dark-muted text-sm">Nenhum produto encontrado para esta busca.</p>
            : <div className="space-y-2">{filteredProducts.map((product) => <div key={product.ucode} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${isProduction ? "border-amber-300/15 bg-amber-400/[0.04]" : "border-white/10 bg-white/[0.03]"}`}>
              <div className="min-w-0"><p className="font-medium text-white">{product.name}</p><p className="break-all font-mono text-xs text-slate-400">UCODE: {product.ucode}</p></div>
              <div className="flex shrink-0 flex-wrap gap-2"><PremiumButton variant="dark" className="!min-h-0 !px-3 !py-2 !text-xs" onClick={() => onCopy(product.ucode)}>{copiedUcode === product.ucode ? "UCODE copiado." : copyFailedUcode === product.ucode ? "Não foi possível copiar" : "Copiar UCODE"}</PremiumButton><PremiumButton variant="dark-primary" className="!min-h-0 !px-3 !py-2 !text-xs" onClick={() => onUse(product)}>Usar este produto</PremiumButton></div>
            </div>)}</div>}
        </div>
        <div className="flex shrink-0 justify-end border-t border-white/[0.065] px-5 py-4 sm:px-7">
          <PremiumButton variant="dark" onClick={onClose}>Fechar</PremiumButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type BuyerCategory = "ready" | "already_inserted" | "review" | "expired" | "not_eligible";
type BuyerRow = { transaction: string; buyer_name: string | null; buyer_email: string | null; purchase_status: string; approved_at: string | null; ordered_at: string | null; category: BuyerCategory; reason: string | null; situation: string; access_start: string | null; access_end: string | null; transaction_registered: boolean };
type BuyerSummary = { eligible: number; already_inserted: number; not_inserted: number; review: number; expired: number; not_eligible: number };
type BuyersData = { mapping: { id: string; product_name: string; product_ucode: string; status: string }; destination: { type: "jornada" | "event"; name: string; status: string } | null; import_blocked_reason: string | null; summary: BuyerSummary; rows: BuyerRow[] };
type BuyerImportResult = { transaction: string; outcome: BuyerCategory | "inserted" | "not_found" | "error"; reason: string | null; row: BuyerRow | null };

const BUYER_IMPORT_BATCH_SIZE = 5;
const buyerCategoryBadge: Record<BuyerCategory, { label: string; tone: string }> = {
  ready: { label: "Pronto para inserir", tone: "info" },
  already_inserted: { label: "Já inserido", tone: "success" },
  review: { label: "Revisão necessária", tone: "warning" },
  expired: { label: "Acesso expirado", tone: "danger" },
  not_eligible: { label: "Não elegível", tone: "neutral" },
};

function summarizeBuyerRows(rows: BuyerRow[]): BuyerSummary {
  return {
    eligible: rows.filter((row) => row.category !== "not_eligible").length,
    already_inserted: rows.filter((row) => row.category === "already_inserted").length,
    not_inserted: rows.filter((row) => row.category === "ready").length,
    review: rows.filter((row) => row.category === "review").length,
    expired: rows.filter((row) => row.category === "expired").length,
    not_eligible: rows.filter((row) => row.category === "not_eligible").length,
  };
}

function applyBuyerImportResult(row: BuyerRow, result: BuyerImportResult): BuyerRow {
  if (result.row) return result.row;
  if (result.outcome === "inserted") return { ...row, category: "already_inserted", situation: "Já inserido", reason: "Inserido agora pela reconciliação." };
  if (result.outcome === "not_found" || result.outcome === "error") return { ...row, category: "review", situation: "Revisão necessária", reason: result.reason };
  return { ...row, category: result.outcome, situation: buyerCategoryBadge[result.outcome].label, reason: result.reason };
}

// Reconciliação de compradores históricos do vínculo: consulta as vendas reais na Hotmart (via API
// administrativa) e só insere os códigos que o Admin selecionar; o servidor revalida cada um.
function HotmartBuyersModal({ mappingId, productName, onClose, onImported }: { mappingId: string; productName: string; onClose: () => void; onImported: () => void }) {
  const [data, setData] = useState<BuyersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | BuyerCategory>("ready");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendAccessEmail, setSendAccessEmail] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<{ inserted: number; already_inserted: number; review: number; errors: number } | null>(null);
  const processingRef = useRef(false);
  const confirmOpenRef = useRef(false);
  const processing = progress !== null;
  function showConfirm(open: boolean) {
    confirmOpenRef.current = open;
    setConfirmOpen(open);
  }
  const titleId = `hotmart-buyers-title-${mappingId}`;

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch(`/api/admin/hotmart/mappings/${mappingId}/buyers`);
      const json = await response.json().catch(() => null) as ({ ok?: boolean; message?: string } & Partial<BuyersData>) | null;
      if (!response.ok || !json?.ok || !json.rows || !json.summary || !json.mapping) {
        setError(response.status === 401 ? "Sua sessão expirou. Entre novamente." : json?.message || `Não foi possível consultar os compradores (erro ${response.status}).`);
        setData(null);
      } else {
        setData({ mapping: json.mapping, destination: json.destination || null, import_blocked_reason: json.import_blocked_reason || null, summary: json.summary, rows: json.rows });
      }
    } catch {
      setError("Erro inesperado ao consultar os compradores. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [mappingId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBuyers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBuyers]);

  const requestClose = useCallback(() => {
    if (processingRef.current) return;
    if (confirmOpenRef.current) showConfirm(false); else onClose();
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [requestClose]);

  const rows = data?.rows || [];
  const summary = summarizeBuyerRows(rows);
  const importBlocked = data?.import_blocked_reason || null;
  const term = normalizeCatalogSearch(search);
  const visibleRows = rows.filter((row) => (filter === "all" || row.category === filter) && (!term || normalizeCatalogSearch(row.buyer_name || "").includes(term) || (row.buyer_email || "").includes(term) || row.transaction.toLowerCase().includes(term)));
  const selectableVisible = visibleRows.filter((row) => row.category === "ready" && !importBlocked);
  const selectedRows = rows.filter((row) => selected.has(row.transaction) && row.category === "ready");
  const filters: Array<["all" | BuyerCategory, string, number]> = [
    ["all", "Todos", rows.length],
    ["ready", "Não inseridos", summary.not_inserted],
    ["already_inserted", "Já inseridos", summary.already_inserted],
    ["review", "Revisão necessária", summary.review],
    ["expired", "Expirados", summary.expired],
    ...(summary.not_eligible ? [["not_eligible", "Não elegíveis", summary.not_eligible] as ["not_eligible", string, number]] : []),
  ];

  function toggle(transaction: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(transaction)) next.delete(transaction); else next.add(transaction);
      return next;
    });
  }

  async function runImport() {
    if (processingRef.current || !selectedRows.length || importBlocked) return;
    processingRef.current = true;
    const codes = selectedRows.map((row) => row.transaction);
    const totals = { inserted: 0, already_inserted: 0, review: 0, errors: 0 };
    showConfirm(false);
    setImportSummary(null);
    setProgress({ done: 0, total: codes.length });
    for (let index = 0; index < codes.length; index += BUYER_IMPORT_BATCH_SIZE) {
      const batch = codes.slice(index, index + BUYER_IMPORT_BATCH_SIZE);
      let results: BuyerImportResult[];
      try {
        const response = await adminFetch(`/api/admin/hotmart/mappings/${mappingId}/buyers/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction_codes: batch, send_access_email: sendAccessEmail }) });
        const json = await response.json().catch(() => null) as { ok?: boolean; message?: string; results?: BuyerImportResult[] } | null;
        results = response.ok && json?.ok && Array.isArray(json.results)
          ? json.results
          : batch.map((transaction) => ({ transaction, outcome: "error" as const, reason: json?.message || `Falha na requisição (erro ${response.status}).`, row: null }));
      } catch {
        results = batch.map((transaction) => ({ transaction, outcome: "error" as const, reason: "Falha de conexão durante a inserção.", row: null }));
      }
      for (const result of results) {
        if (result.outcome === "inserted") totals.inserted += 1;
        else if (result.outcome === "already_inserted") totals.already_inserted += 1;
        else if (result.outcome === "error") totals.errors += 1;
        else totals.review += 1;
      }
      const byCode = new Map(results.map((result) => [result.transaction, result]));
      setData((current) => current ? { ...current, rows: current.rows.map((row) => byCode.has(row.transaction) ? applyBuyerImportResult(row, byCode.get(row.transaction) as BuyerImportResult) : row) } : current);
      setSelected((current) => {
        const next = new Set(current);
        for (const transaction of batch) next.delete(transaction);
        return next;
      });
      setProgress({ done: Math.min(index + batch.length, codes.length), total: codes.length });
    }
    setImportSummary(totals);
    setProgress(null);
    processingRef.current = false;
    if (totals.inserted) onImported();
  }

  const metrics: Array<[string, number, string]> = [
    ["Compradores elegíveis", summary.eligible, "text-white"],
    ["Já inseridos", summary.already_inserted, "text-emerald-200"],
    ["Não inseridos", summary.not_inserted, "text-orange-200"],
    ["Revisão necessária", summary.review, "text-amber-200"],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-3 font-sans backdrop-blur-md sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="et-admin-dark-panel relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden text-white sm:max-h-[calc(100dvh-2rem)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="relative flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-300">Produção — vendas reais</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Compradores Hotmart</h2>
            <p className="mt-1.5 text-sm text-slate-400">Confira quem comprou este produto e ainda não possui acesso ao destino vinculado.</p>
            <p className="mt-2 truncate text-xs text-slate-500">{productName}{data?.destination ? ` → ${data.destination.type === "event" ? "Evento" : "Jornada"}: ${data.destination.name}` : ""}</p>
          </div>
          <button type="button" onClick={requestClose} disabled={processing} aria-label="Fechar compradores" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        {loading ? <div className="relative border-t border-white/[0.065] px-5 py-10 text-center sm:px-7" role="status"><p className="et-admin-dark-text">Consultando as vendas na Hotmart e comparando com o destino...</p><p className="mt-1 text-xs text-slate-500">Todas as páginas do histórico são percorridas; isso pode levar alguns segundos.</p></div>
          : error ? <div className="relative border-t border-white/[0.065] px-5 py-6 sm:px-7"><p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p><div className="mt-3"><PremiumButton variant="dark" onClick={() => void loadBuyers()}>Tentar novamente</PremiumButton></div></div>
          : <>
            <div className="relative shrink-0 space-y-3 px-5 pb-3 sm:px-7">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {metrics.map(([label, value, tone]) => <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p></div>)}
              </div>
              {summary.expired ? <p className="w-fit rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-200">Acesso expirado: {summary.expired}</p> : null}
              {importBlocked ? <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-100" role="alert">{importBlocked}</p> : null}
              {importSummary ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-2.5" role="status"><p className="text-sm text-emerald-100">{importSummary.inserted} inseridos com sucesso · {importSummary.already_inserted} já estavam inseridos · {importSummary.review} exigem revisão · {importSummary.errors} erros</p><PremiumButton variant="dark" className="!min-h-0 !px-3 !py-1.5 !text-xs" onClick={() => setFilter("ready")}>Ver somente pendentes</PremiumButton></div> : null}
              {progress ? <p className="rounded-xl border border-orange-300/20 bg-orange-400/10 px-4 py-2.5 text-sm text-orange-100" role="status">Processando {progress.done} de {progress.total}...</p> : null}
              <PremiumInput variant="jornada" aria-label="Buscar por nome ou e-mail" placeholder="Buscar por nome ou e-mail..." value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filters.map(([key, label, count]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === key ? "border-orange-400/40 bg-orange-500/[0.14] text-orange-100" : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/[0.15] hover:text-white"}`}>{label} <span className="ml-1 text-slate-500">{count}</span></button>)}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <PremiumButton variant="dark" className="!min-h-0 !px-3 !py-1.5 !text-xs" disabled={processing || !selectableVisible.length} onClick={() => setSelected((current) => new Set([...current, ...selectableVisible.map((row) => row.transaction)]))}>Selecionar todos os elegíveis visíveis</PremiumButton>
                <PremiumButton variant="dark" className="!min-h-0 !px-3 !py-1.5 !text-xs" disabled={processing || !selected.size} onClick={() => setSelected(new Set())}>Limpar seleção</PremiumButton>
                <span className="text-slate-500">{selectedRows.length} selecionado(s)</span>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto border-t border-white/[0.065] px-5 py-4 sm:px-7">
              {!rows.length ? <p className="et-admin-dark-muted text-sm">A Hotmart não retornou compras aprovadas para este produto.</p>
                : !visibleRows.length ? <p className="et-admin-dark-muted text-sm">Nenhum comprador nesta visão.</p>
                : <div className="space-y-2">{visibleRows.map((row) => {
                  const badge = buyerCategoryBadge[row.category];
                  const selectable = row.category === "ready" && !importBlocked;
                  const checked = selectable && selected.has(row.transaction);
                  return <div key={row.transaction} className={`flex gap-3 rounded-xl border p-4 transition ${checked ? "border-orange-400/35 bg-orange-500/[0.07]" : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12]"}`}>
                    <div className="pt-0.5"><input type="checkbox" aria-label={`Selecionar ${row.buyer_name || row.buyer_email || row.transaction}`} className="h-4 w-4 accent-orange-500 disabled:opacity-30" checked={checked} disabled={!selectable || processing} onChange={() => toggle(row.transaction)} /></div>
                    <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
                      <div className="min-w-0"><p className="truncate font-semibold text-white">{row.buyer_name || "Comprador sem nome"}</p><p className="truncate text-xs text-slate-400">{row.buyer_email || "E-mail não informado"}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-500">{row.transaction} · {row.purchase_status}</p></div>
                      <div className="min-w-0 text-xs"><p className="text-slate-500">Compra</p><p className="et-admin-dark-text">{formatDateTime(row.approved_at || row.ordered_at) || "—"}</p><p className="mt-1 text-slate-500">Acesso previsto</p><p className="et-admin-dark-text">{row.access_start ? `${formatDate(row.access_start)} → ${row.access_end ? formatDate(row.access_end) : "fim do Evento"}` : "—"}</p></div>
                      <div className="min-w-0"><span className={`et-admin-dark-badge et-admin-dark-badge-${badge.tone}`}>{badge.label}</span><p className="mt-1.5 text-xs text-slate-400">{row.situation}</p>{row.reason ? <p className="mt-1 text-xs text-slate-500">{row.reason}</p> : null}</div>
                    </div>
                  </div>;
                })}</div>}
            </div>
          </>}

        <div className="relative flex shrink-0 flex-col-reverse gap-2 border-t border-white/[0.065] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs text-slate-500">Expirados e conflitos não são selecionáveis. Quem já está no destino nunca é alterado.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <PremiumButton variant="dark" disabled={processing} onClick={requestClose}>Fechar</PremiumButton>
            <PremiumButton variant="dark-primary" disabled={processing || loading || !selectedRows.length || Boolean(importBlocked)} onClick={() => showConfirm(true)}>{processing ? "Processando..." : `Inserir ${selectedRows.length} selecionado${selectedRows.length === 1 ? "" : "s"}`}</PremiumButton>
          </div>
        </div>

        {confirmOpen ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-confirm`} className="et-admin-dark-panel w-full max-w-lg p-6">
            <h3 id={`${titleId}-confirm`} className="text-lg font-semibold text-white">Inserir {selectedRows.length} comprador{selectedRows.length === 1 ? "" : "es"}?</h3>
            <div className="mt-3 space-y-1.5 text-sm text-slate-300">
              <p>Produto: <span className="text-white">{productName}</span></p>
              <p>Destino: <span className="text-white">{data?.destination ? `${data.destination.type === "event" ? "Evento" : "Jornada"} ${data.destination.name}` : "—"}</span></p>
              <p className="rounded-xl border border-orange-300/20 bg-orange-400/10 px-3 py-2 text-orange-100">Os acessos serão calculados a partir da data original de cada compra.</p>
              <p className="text-xs text-slate-500">Cada venda é revalidada na Hotmart antes da inserção. Acessos expirados não são criados por este fluxo.</p>
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-300"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-500" checked={sendAccessEmail} onChange={(event) => setSendAccessEmail(event.target.checked)} />Enviar e-mail de acesso aos novos alunos inseridos</label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PremiumButton variant="dark" onClick={() => showConfirm(false)}>Cancelar</PremiumButton>
              <PremiumButton variant="dark-primary" onClick={() => void runImport()}>Confirmar inserção</PremiumButton>
            </div>
          </div>
        </div> : null}
      </div>
    </div>,
    document.body,
  );
}

export default function HotmartPageClient({ jornadas, events }: { jornadas: Destination[]; events: Destination[] }) {
  const [data, setData] = useState<Data>({ configured: false, readiness: emptyReadiness, mappings: [], transactions: [], history: [] });
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ hotmart_product_ucode: "", hotmart_product_name: "", hotmart_product_id: "", destination_type: "jornada", destination_id: "" });
  const [productSource, setProductSource] = useState<"sandbox" | "production">("sandbox");
  const [mappingTarget, setMappingTarget] = useState<Transaction | null>(null);
  const [pendingMappingForm, setPendingMappingForm] = useState({ destination_type: "jornada", destination_id: "" });
  const [savingPendingMapping, setSavingPendingMapping] = useState(false);
  const [lookingUpProduct, setLookingUpProduct] = useState(false);
  const [sandboxProducts, setSandboxProducts] = useState<{ name: string; ucode: string }[] | null>(null);
  const [loadingSandboxProducts, setLoadingSandboxProducts] = useState(false);
  const [sandboxProductsError, setSandboxProductsError] = useState("");
  const [copiedUcode, setCopiedUcode] = useState("");
  const [copyFailedUcode, setCopyFailedUcode] = useState("");
  const [catalogSource, setCatalogSource] = useState<"sandbox" | "production" | null>(null);
  const [savingMapping, setSavingMapping] = useState(false);
  const savingMappingRef = useRef(false);
  const [mappingFeedback, setMappingFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const mappingFormRef = useRef<HTMLDivElement>(null);
  const [buyersTarget, setBuyersTarget] = useState<{ id: string; name: string } | null>(null);
  const [buyerPreview, setBuyerPreview] = useState<{ mappingId: string; name: string; state: "loading" | "done" | "error"; summary?: BuyerSummary; message?: string } | null>(null);
  const [productionProducts, setProductionProducts] = useState<{ name: string; ucode: string }[] | null>(null);
  const [loadingProductionProducts, setLoadingProductionProducts] = useState(false);
  const [productionProductsError, setProductionProductsError] = useState("");
  const [transactionFilters, setTransactionFilters] = useState<TransactionFilters>(emptyTransactionFilters);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const dateRangeRef = useRef<HTMLDivElement>(null);
  const dateRangePanelRef = useRef<HTMLDivElement>(null);
  const [dateRangeRect, setDateRangeRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Painel de "Data da compra" portado para document.body (mesma técnica de EvaluatedTopicsInput e
  // HotmartDropdown): nunca depende de overflow/stacking context de nenhum ancestral (PremiumCard usa
  // backdrop-filter, que cria stacking context por card — dois cards irmãos nunca resolveriam isso só
  // com z-index). Reposiciona em scroll (inclusive ancestrais roláveis, via capture) e resize.
  useLayoutEffect(() => {
    if (!dateRangeOpen) return;
    function updateRect() {
      const node = dateRangeRef.current;
      if (!node) return;
      const bounds = node.getBoundingClientRect();
      setDateRangeRect({ top: bounds.bottom + 6, left: bounds.left, width: bounds.width });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [dateRangeOpen]);

  useEffect(() => {
    if (!dateRangeOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dateRangeRef.current?.contains(target) || dateRangePanelRef.current?.contains(target)) return;
      setDateRangeOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDateRangeOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dateRangeOpen]);

  // silent: recarrega sem trocar a aba pelo "Carregando..." (usado após salvar um vínculo, para a
  // lista atualizar no lugar sem perder a posição nem o feedback ao lado do botão).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const response = await adminFetch("/api/admin/hotmart");
    const json = await response.json();
    if (response.ok && json.ok) setData(json);
    else setMessage(json.message || "Não foi possível carregar.");
    if (!silent) setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createMapping() {
    if (savingMappingRef.current) return;
    if (!form.hotmart_product_ucode.trim() || !form.hotmart_product_name) { setMappingFeedback({ tone: "error", text: "Busque e confirme o produto na Hotmart antes de salvar." }); return; }
    if (!form.destination_id) { setMappingFeedback({ tone: "error", text: form.destination_type === "event" ? "Selecione o Evento de destino." : "Selecione a Jornada de destino." }); return; }
    savingMappingRef.current = true;
    setSavingMapping(true);
    setMappingFeedback(null);
    try {
      const response = await adminFetch("/api/admin/hotmart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, product_source: productSource, verify_product_with_hotmart: true }) });
      const json = await response.json().catch(() => null) as { ok?: boolean; message?: string; mapping?: { id?: string } } | null;
      if (!response.ok || !json?.ok) {
        const text = response.status === 401 ? "Sua sessão expirou. Entre novamente para salvar o vínculo."
          : response.status === 403 ? "Sua conta não tem permissão de administrador para salvar vínculos."
          : json?.message || `Não foi possível salvar o vínculo (erro ${response.status}).`;
        setMappingFeedback({ tone: "error", text });
        return;
      }
      setForm((current) => ({ ...current, hotmart_product_ucode: "", hotmart_product_name: "", hotmart_product_id: "", destination_id: "" }));
      setMappingFeedback({ tone: "success", text: "Produto vinculado com sucesso." });
      const savedName = form.hotmart_product_name;
      await load(true);
      if (json.mapping?.id && productSource === "production") void previewBuyers(json.mapping.id, savedName);
    } catch {
      setMappingFeedback({ tone: "error", text: "Erro inesperado ao salvar o vínculo. Verifique a conexão e tente novamente." });
    } finally {
      savingMappingRef.current = false;
      setSavingMapping(false);
    }
  }
  // Resumo discreto após salvar o vínculo; nada é inserido. Falha aqui não desfaz o vínculo salvo.
  async function previewBuyers(mappingId: string, name: string) {
    setBuyerPreview({ mappingId, name, state: "loading" });
    try {
      const response = await adminFetch(`/api/admin/hotmart/mappings/${mappingId}/buyers`);
      const json = await response.json().catch(() => null) as { ok?: boolean; message?: string; summary?: BuyerSummary } | null;
      setBuyerPreview(response.ok && json?.ok && json.summary
        ? { mappingId, name, state: "done", summary: json.summary }
        : { mappingId, name, state: "error", message: json?.message || "Não foi possível verificar os compradores anteriores agora." });
    } catch {
      setBuyerPreview({ mappingId, name, state: "error", message: "Não foi possível verificar os compradores anteriores agora." });
    }
  }
  const closeBuyers = useCallback(() => setBuyersTarget(null), []);
  async function lookupProduct() {
    const ucode = form.hotmart_product_ucode.trim();
    if (!ucode) { setMessage("Informe o Product UCODE."); return; }
    setLookingUpProduct(true);
    setForm((current) => ({ ...current, hotmart_product_name: "" }));
    const lookupEndpoint = productSource === "production" ? "/api/admin/hotmart/products/production/lookup" : "/api/admin/hotmart/products/lookup";
    const response = await adminFetch(`${lookupEndpoint}?ucode=${encodeURIComponent(ucode)}`);
    const json = await response.json() as { ok?: boolean; message?: string; product?: { ucode?: string; name?: string } };
    if (response.ok && json.product?.name && json.product.ucode) {
      setForm((current) => ({ ...current, hotmart_product_ucode: json.product?.ucode || ucode, hotmart_product_name: json.product?.name || "" }));
    }
    setMessage(json.message || (response.ok ? "Produto encontrado." : "Não foi possível consultar o produto."));
    setLookingUpProduct(false);
  }
  async function listSandboxProducts() {
    if (loadingSandboxProducts) return;
    setLoadingSandboxProducts(true);
    setSandboxProductsError("");
    const response = await adminFetch("/api/admin/hotmart/products");
    const json = await response.json() as { ok?: boolean; message?: string; products?: { name: string; ucode: string }[] };
    if (response.ok && json.ok) {
      setSandboxProducts(json.products || []);
    } else {
      setSandboxProducts(null);
      setSandboxProductsError(json.message || "Não foi possível listar os produtos da Hotmart.");
    }
    setLoadingSandboxProducts(false);
  }
  async function listProductionProducts() {
    if (loadingProductionProducts) return;
    setLoadingProductionProducts(true);
    setProductionProductsError("");
    const response = await adminFetch("/api/admin/hotmart/products/production");
    const json = await response.json() as { ok?: boolean; message?: string; products?: { name: string; ucode: string }[] };
    if (response.ok && json.ok) {
      setProductionProducts(json.products || []);
    } else {
      setProductionProducts(null);
      setProductionProductsError(json.message || "Não foi possível listar os produtos reais da Hotmart.");
    }
    setLoadingProductionProducts(false);
  }
  function fillProductFromCatalog(product: { name: string; ucode: string }, source: "sandbox" | "production") {
    setProductSource(source);
    setForm((current) => ({ ...current, hotmart_product_ucode: product.ucode, hotmart_product_name: product.name }));
    setMappingFeedback(null);
    setCatalogSource(null);
    window.requestAnimationFrame(() => mappingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const closeCatalog = useCallback(() => setCatalogSource(null), []);
  function openSandboxCatalog() {
    setCatalogSource("sandbox");
    void listSandboxProducts();
  }
  function openProductionCatalog() {
    setCatalogSource("production");
    void listProductionProducts();
  }
  async function copyUcode(ucode: string) {
    try {
      await navigator.clipboard.writeText(ucode);
      setCopiedUcode(ucode);
      window.setTimeout(() => setCopiedUcode((current) => (current === ucode ? "" : current)), 2000);
    } catch {
      setMessage("Não foi possível copiar o UCODE.");
      setCopyFailedUcode(ucode);
      window.setTimeout(() => setCopyFailedUcode((current) => (current === ucode ? "" : current)), 2000);
    }
  }
  async function setMappingStatus(id: string, status: string) {
    const response = await adminFetch(`/api/admin/hotmart/mappings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const json = await response.json(); setMessage(json.message); if (response.ok) await load();
  }
  async function transactionAction(id: string, action: string) {
    const response = action === "refund"
      ? await adminFetch(`/api/admin/hotmart/transactions/${id}/refund`, { method: "POST" })
      : await adminFetch(`/api/admin/hotmart/transactions/${id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const json = await response.json(); setMessage(json.message); if (response.ok) await load();
  }
  async function recoverEmails() {
    const response = await adminFetch("/api/admin/hotmart/recover-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 20 }) });
    const json = await response.json(); setMessage(json.message); if (response.ok) await load();
  }

  function renderTransactionCard(item: Transaction) {
    const activeMapping = data.mappings.find((candidate) => candidate.hotmart_product_ucode === item.hotmart_product_ucode && candidate.status === "active");
    const anyMapping = data.mappings.find((candidate) => candidate.hotmart_product_ucode === item.hotmart_product_ucode);
    const destinationName = activeMapping ? (activeMapping.jornadas?.title || activeMapping.simulado_events?.name) : null;
    const destinationTypeLabel = activeMapping?.destination_type === "event" ? "Evento" : "Jornada";
    // Estado do vínculo é definido pelo mapping do PRODUTO (por hotmart_product_ucode), nunca por transação
    // individual — a mesma classificação vale para toda transação desse UCODE.
    const linkState: "linked" | "destination_unavailable" | "mapping_inactive" | "unlinked" =
      activeMapping && destinationName ? "linked"
        : activeMapping ? "destination_unavailable"
        : anyMapping ? "mapping_inactive"
        : "unlinked";
    const access = item.hotmart_access_links?.[0];
    const accessStarted = access?.student_jornadas?.started_at || access?.access_started_at;
    const accessExpires = access?.student_jornadas?.expires_at || access?.access_expires_at;
    const accessStatus = accessStateLabel(access?.student_jornadas?.status || access?.simulado_event_participants?.access_status || access?.access_state);
    const purchaseDate = formatDateTime(item.purchase_approved_at) || formatDateTime(item.purchase_created_at);
    const purchaseValue = formatCurrencyAmount(item.amount, item.currency);
    const purchaseValueNeedsCurrency = purchaseValue === null && item.amount !== null && item.amount !== undefined && !Number.isNaN(Number(item.amount));
    const tone = processingStatusTone(item.processing_status, item.refund_request_state, item.processing_error_code);
    // "Vincular" depende primordialmente do estado REAL do mapping — nunca existe mapping ativo/válido
    // para este UCODE — e não fica escondido por causa do processing_status da transação específica.
    const canLink = linkState === "unlinked";
    const canReprocess = item.processing_status.startsWith("pending") && (item.processing_status !== "pending_mapping" || Boolean(activeMapping));
    const canExtend = item.processing_status === "pending_duplicate_purchase" && item.destination_type === "jornada";
    const canRefund = item.processing_status.startsWith("pending");
    // Apenas apresentação: quando o produto não tem vínculo algum E o processamento também aponta
    // ausência de destino/mapeamento, as duas mensagens soam redundantes/contraditórias para o Admin.
    // Não altera processing_status, linkState nem nenhuma semântica interna — só o texto exibido aqui.
    const awaitingDestinationCopy = linkState === "unlinked" && (item.processing_status === "pending_mapping" || item.processing_status === "pending_destination");
    const situationLabel = awaitingDestinationCopy ? "Aguardando definição de destino" : processingStatusLabel(item.processing_status, item.refund_request_state, item.processing_error_code);
    const situationHelper = awaitingDestinationCopy ? "Vincule este produto a uma Jornada ou Evento para permitir o processamento." : null;
    return <div key={item.id} className="et-admin-dark-list-card overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-white/[0.12] sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="et-admin-dark-icon-box et-admin-dark-icon-box-orange shrink-0">
            <Package size={18} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="et-admin-dark-label">Produto Hotmart</p>
            <h3 className="et-admin-dark-card-title mt-1 truncate text-base" title={item.product_name_snapshot || undefined}>{item.product_name_snapshot || "Produto não identificado"}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="break-all font-mono text-[11px] text-slate-500">UCODE: {item.hotmart_product_ucode}</span>
              <button type="button" onClick={() => void copyUcode(item.hotmart_product_ucode)} className="et-admin-dark-badge et-admin-dark-badge-neutral shrink-0">{copiedUcode === item.hotmart_product_ucode ? "UCODE copiado." : "Copiar UCODE"}</button>
            </div>
          </div>
        </div>
        <span className={`et-admin-dark-badge et-admin-dark-badge-${purchaseStatusTone(item.purchase_status)} shrink-0`}>{purchaseStatusLabel(item.purchase_status)}</span>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-5">
          <div className="et-admin-dark-divider border-t pt-4">
            <p className="et-admin-dark-label">Compra</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Data</p>
                <p className="et-admin-dark-text mt-1">{purchaseDate || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor</p>
                {purchaseValue ? (
                  <p className="et-admin-dark-text mt-1 font-semibold">{purchaseValue}</p>
                ) : purchaseValueNeedsCurrency ? (
                  <>
                    <p className="et-admin-dark-text mt-1 font-semibold">{formatPlainAmount(item.amount)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">moeda não informada</p>
                  </>
                ) : (
                  <p className="et-admin-dark-text mt-1">—</p>
                )}
              </div>
            </div>
          </div>
          <div className="et-admin-dark-divider border-t pt-4">
            <p className="et-admin-dark-label">Comprador</p>
            <p className="et-admin-dark-text mt-1 font-semibold">{item.students?.name || item.buyer_email}</p>
            {item.students?.name ? <p className="mt-1 text-xs text-slate-500">{item.buyer_email}</p> : null}
          </div>
        </div>
        <div className="w-full space-y-5 lg:w-80 lg:flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div>
            <p className="et-admin-dark-label">Acesso no EstudoTOP</p>
            {linkState === "linked" ? <div className="mt-2 space-y-1">
              <span className="et-admin-dark-badge et-admin-dark-badge-success">Vinculado</span>
              <p className="et-admin-dark-text">{destinationTypeLabel}: {destinationName}</p>
              {accessStarted ? <p className="text-xs text-slate-500">Entrada: {formatDate(accessStarted)}</p> : null}
              {accessExpires ? <p className="text-xs text-slate-500">Expira: {formatDate(accessExpires)}</p> : null}
              {accessStatus && accessStatus !== "Ativo" ? <p className="text-xs text-slate-500">Situação do acesso: {accessStatus}</p> : null}
            </div> : linkState === "destination_unavailable" ? <div className="mt-2 space-y-2">
              <span className="et-admin-dark-badge et-admin-dark-badge-warning">Destino indisponível</span>
              <p className="text-xs text-slate-500">O produto está vinculado, mas o destino (Jornada/Evento) não pôde ser resolvido. Revise em Produtos vinculados.</p>
            </div> : linkState === "mapping_inactive" ? <div className="mt-2 space-y-2">
              <span className="et-admin-dark-badge et-admin-dark-badge-warning">Vínculo inativo</span>
              <p className="text-xs text-slate-500">Existe um vínculo para este produto, mas está inativo/arquivado — não conta como acesso concedido. Reative em Produtos vinculados.</p>
            </div> : <div className="mt-2 space-y-2">
              <span className="et-admin-dark-badge et-admin-dark-badge-neutral">Produto não vinculado</span>
              <p className="text-xs text-slate-500">Destino: Nenhum</p>
              {canLink ? <PremiumButton variant="dark-primary" icon={<Link2 size={16} />} onClick={() => openMappingModal(item)}>Vincular</PremiumButton> : null}
            </div>}
          </div>
          <div className="et-admin-dark-divider border-t pt-4">
            <p className="et-admin-dark-label">Transação</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-400">{item.transaction_code}</p>
          </div>
          <div className="et-admin-dark-divider border-t pt-4">
            <p className="et-admin-dark-label">Situação no EstudoTOP</p>
            <span className={`et-admin-dark-badge et-admin-dark-badge-${tone} mt-1.5`}>{situationLabel}</span>
            {situationHelper ? <p className="mt-1.5 text-xs text-slate-500">{situationHelper}</p> : null}
          </div>
          {canReprocess || canExtend || canRefund ? <div className="et-admin-dark-divider flex flex-wrap gap-2 border-t pt-4">
            {canReprocess ? <PremiumButton variant="dark" onClick={() => void transactionAction(item.id, "reprocess")}>Reprocessar</PremiumButton> : null}
            {canExtend ? <PremiumButton variant="dark-success" onClick={() => void transactionAction(item.id, "extend_jornada")}>Estender matrícula</PremiumButton> : null}
            {canRefund ? <PremiumButton variant="dark-warning" onClick={() => void transactionAction(item.id, "refund")}>Solicitar estorno</PremiumButton> : null}
          </div> : null}
        </div>
      </div>
    </div>;
  }

  function renderTransactionRow(transaction: Transaction) {
    const flags = deriveTransactionFlags(transaction, data.mappings);
    const purchaseDate = formatDateTime(transaction.purchase_approved_at) || formatDateTime(transaction.purchase_created_at) || "—";
    return <div key={transaction.id} role="button" tabIndex={0} onClick={() => setSelectedTransaction(transaction)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedTransaction(transaction); } }} className="et-admin-dark-list-card flex cursor-pointer flex-wrap items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-white/[0.12] sm:flex-nowrap sm:gap-5">
      <div className="w-full shrink-0 sm:w-28">
        <p className="truncate font-mono text-[11px] text-slate-500">{transaction.transaction_code}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{purchaseDate}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{transaction.students?.name || transaction.buyer_email}</p>
        {transaction.students?.name ? <p className="truncate text-[11px] text-slate-500">{transaction.buyer_email}</p> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-200" title={transaction.product_name_snapshot || undefined}>{transaction.product_name_snapshot || "Produto não identificado"}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate font-mono text-[11px] text-slate-500">{transaction.hotmart_product_ucode}</span>
          <div onClick={(event: React.MouseEvent) => event.stopPropagation()}>
            <button type="button" onClick={() => void copyUcode(transaction.hotmart_product_ucode)} className="et-admin-dark-badge et-admin-dark-badge-neutral shrink-0">{copiedUcode === transaction.hotmart_product_ucode ? "Copiado" : "Copiar UCODE"}</button>
          </div>
        </div>
      </div>
      <div className="w-full shrink-0 sm:w-48">
        {flags.linkState === "linked" ? <div className="space-y-1">
          <span className="et-admin-dark-badge et-admin-dark-badge-success">Vinculado</span>
          <p className="truncate text-[11px] text-slate-400">{flags.destinationTypeLabel}: {flags.destinationName}</p>
        </div> : flags.linkState === "destination_unavailable" ? <span className="et-admin-dark-badge et-admin-dark-badge-warning">Destino indisponível</span>
          : flags.linkState === "mapping_inactive" ? <span className="et-admin-dark-badge et-admin-dark-badge-warning">Vínculo inativo</span>
          : <div className="flex flex-wrap items-center gap-2">
            <span className="et-admin-dark-badge et-admin-dark-badge-neutral">Produto não vinculado</span>
            <div onClick={(event: React.MouseEvent) => event.stopPropagation()}>
              <PremiumButton variant="dark-primary" className="!min-h-0 !px-3 !py-1.5 !text-[11px]" icon={<Link2 size={12} />} onClick={() => openMappingModal(transaction)}>Vincular</PremiumButton>
            </div>
          </div>}
      </div>
      <div className="w-full shrink-0 sm:w-36"><span className={`et-admin-dark-badge et-admin-dark-badge-${purchaseStatusTone(transaction.purchase_status)}`}>{purchaseStatusLabel(transaction.purchase_status)}</span></div>
      <ChevronRight size={16} className="hidden shrink-0 text-slate-600 sm:block" />
    </div>;
  }

  function openMappingModal(item: Transaction) {
    setMappingTarget(item);
    setPendingMappingForm({ destination_type: "jornada", destination_id: "" });
  }

  async function savePendingMapping(reprocess: boolean) {
    if (!mappingTarget || !pendingMappingForm.destination_id) {
      setMessage("Selecione uma Jornada ou Evento.");
      return;
    }
    setSavingPendingMapping(true);
    const mappingResponse = await adminFetch("/api/admin/hotmart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotmart_product_ucode: mappingTarget.hotmart_product_ucode,
        hotmart_product_name: mappingTarget.product_name_snapshot,
        hotmart_product_id: "",
        destination_type: pendingMappingForm.destination_type,
        destination_id: pendingMappingForm.destination_id,
      }),
    });
    const mappingJson = await mappingResponse.json();
    if (!mappingResponse.ok) {
      setMessage(mappingJson.message || "Não foi possível criar o vínculo.");
      setSavingPendingMapping(false);
      return;
    }
    if (!reprocess) {
      setMessage(mappingJson.message || "Produto Hotmart vinculado.");
      setMappingTarget(null);
      setSavingPendingMapping(false);
      await load();
      return;
    }
    const reprocessResponse = await adminFetch(`/api/admin/hotmart/transactions/${mappingTarget.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reprocess" }),
    });
    const reprocessJson = await reprocessResponse.json();
    setMessage(reprocessResponse.ok ? reprocessJson.message : `Vínculo criado, mas ${reprocessJson.message || "não foi possível reprocessar a transação."}`);
    setMappingTarget(null);
    setSavingPendingMapping(false);
    await load();
  }

  const pending = data.transactions
    .filter((item) => item.processing_status.startsWith("pending") || item.processing_status === "processing_error" || item.processing_status === "refund_reconciliation_required" || item.refund_request_state === "reconciliation_required");
  const commercialDateReviews = pending.filter((item) => item.processing_error_code === "COMMERCIAL_DATE_REQUIRES_REVIEW");
  const duplicates = data.transactions.filter((item) => item.processing_status === "pending_duplicate_purchase");
  const duplicateStudents = data.transactions.filter((item) => item.possible_duplicate_student_id && !item.resolved_at);
  const destinations = form.destination_type === "jornada" ? jornadas : events;
  const pendingMappingDestinations = (pendingMappingForm.destination_type === "jornada" ? jornadas : events)
    .filter((item) => pendingMappingForm.destination_type === "jornada" ? item.status === "published" : ["scheduled", "active"].includes(item.status));
  const destinationNameOptions = Array.from(new Set(data.transactions.map((transaction) => deriveTransactionFlags(transaction, data.mappings).destinationName).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filteredTransactions = data.transactions.filter((transaction) => {
    const flags = deriveTransactionFlags(transaction, data.mappings);
    if (transactionFilters.buyer) {
      const term = transactionFilters.buyer.trim().toLowerCase();
      const matchesBuyer = (transaction.students?.name || "").toLowerCase().includes(term) || transaction.buyer_email.toLowerCase().includes(term);
      if (!matchesBuyer) return false;
    }
    if (transactionFilters.code && !transaction.transaction_code.toLowerCase().includes(transactionFilters.code.trim().toLowerCase())) return false;
    if (transactionFilters.product) {
      const term = transactionFilters.product.trim().toLowerCase();
      const matchesProduct = (transaction.product_name_snapshot || "").toLowerCase().includes(term) || transaction.hotmart_product_ucode.toLowerCase().includes(term);
      if (!matchesProduct) return false;
    }
    if (transactionFilters.destinationType === "unlinked" && flags.linkState !== "unlinked") return false;
    if (transactionFilters.destinationType === "jornada" && !(flags.linkState === "linked" && flags.activeMapping?.destination_type !== "event")) return false;
    if (transactionFilters.destinationType === "event" && !(flags.linkState === "linked" && flags.activeMapping?.destination_type === "event")) return false;
    if (transactionFilters.destinationName && flags.destinationName !== transactionFilters.destinationName) return false;
    const referenceDate = transaction.purchase_approved_at || transaction.purchase_created_at || transaction.created_at;
    if (transactionFilters.dateFrom && (!referenceDate || new Date(referenceDate).getTime() < new Date(`${transactionFilters.dateFrom}T00:00:00Z`).getTime())) return false;
    if (transactionFilters.dateTo && (!referenceDate || new Date(referenceDate).getTime() > new Date(`${transactionFilters.dateTo}T23:59:59Z`).getTime())) return false;
    return true;
  });
  const tabs = [["overview", "Visão geral"], ["mappings", "Produtos vinculados"], ["transactions", "Transações"], ["pending", "Pendências"], ["duplicates", "Compras em duplicidade"], ["students", "Possíveis cadastros duplicados"], ["history", "Histórico / Logs"]];

  return <PageBackground><PageHeader eyebrow="Configurações" title="Integração Hotmart" description="Produtos, transações e acessos comerciais vinculados aos motores oficiais do EstudoTOP." action={<PremiumButton variant="dark" icon={<RefreshCw size={16} />} onClick={() => void load()}>Atualizar</PremiumButton>} />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Integração" value={data.configured ? "Configurada" : "Pendente"} detail={data.readiness.environment || "ambiente não definido"} icon={data.configured ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} /><MetricCard label="Produtos" value={String(data.mappings.length)} detail="vínculos cadastrados" icon={<Link2 size={18} />} /><MetricCard label="Transações" value={String(data.transactions.length)} detail="100 mais recentes" icon={<CreditCard size={18} />} /><MetricCard label="Pendências" value={String(pending.length)} detail="exigem tratamento" icon={<AlertTriangle size={18} />} /></div>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-2">{tabs.map(([key,label]) => <PremiumButton key={key} variant={tab === key ? "dark-primary" : "dark"} onClick={() => setTab(key)}>{label}</PremiumButton>)}</div>
    {message ? <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{message}</div> : null}
    {loading ? <PremiumCard><p className="et-admin-dark-text">Carregando...</p></PremiumCard> : null}
    {!loading && tab === "overview" ? <PremiumCard title="Estado operacional" icon={<CreditCard size={18} />}><p className="et-admin-dark-text">O webhook autentica, deduplica e processa cada produto isoladamente. Credenciais nunca são exibidas nesta tela.</p><div className="mt-4"><PremiumButton variant="dark" onClick={() => void recoverEmails()}>Recuperar e-mails pendentes</PremiumButton></div></PremiumCard> : null}
    {!loading && tab === "mappings" ? <div className="space-y-5"><PremiumCard title="Descoberta de produtos (temporário)"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Sandbox — catálogo fictício de homologação</p><p className="mt-1 et-admin-dark-muted text-sm">{data.readiness.environment === "sandbox" ? "Produtos disponíveis no Sandbox Hotmart." : data.readiness.environment === "production" ? "Produtos disponíveis na Hotmart (produção)." : "Ambiente Hotmart não definido."}</p><div className="mt-3"><PremiumButton variant="dark" disabled={loadingSandboxProducts} onClick={openSandboxCatalog}>{loadingSandboxProducts ? "Buscando produtos..." : "Listar produtos Sandbox"}</PremiumButton></div></div><div className="mt-6 border-t border-amber-300/20 pt-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">Produção — catálogo real da conta Hotmart</p><p className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Consulta somente leitura. Nenhuma venda, acesso ou configuração da Hotmart será alterada.</p><div className="mt-3"><PremiumButton variant="dark" disabled={loadingProductionProducts} onClick={openProductionCatalog}>{loadingProductionProducts ? "Buscando produtos..." : "Listar meus produtos Hotmart"}</PremiumButton></div></div></PremiumCard><div ref={mappingFormRef} className="scroll-mt-6"><PremiumCard title="Vincular produto"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-xs"><HotmartDropdown label="Origem do produto Hotmart" value={productSource} onChange={(value) => setProductSource(value === "production" ? "production" : "sandbox")} options={[{ value: "production", label: "Produção — meus produtos reais" }, { value: "sandbox", label: "Sandbox — produtos fictícios de homologação" }]} /></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${productSource === "production" ? "border border-amber-300/30 bg-amber-400/10 text-amber-200" : "border border-white/10 bg-white/[0.03] text-slate-300"}`}>Origem: {productSource === "production" ? "Produção" : "Sandbox"}</span></div><div className="grid gap-4 md:grid-cols-2"><div><PremiumInput variant="jornada" label="Product UCODE" value={form.hotmart_product_ucode} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, hotmart_product_ucode: event.target.value, hotmart_product_name: "" })} /><div className="mt-2"><PremiumButton variant="dark" disabled={lookingUpProduct || !form.hotmart_product_ucode.trim()} onClick={() => void lookupProduct()}>{lookingUpProduct ? "Buscando..." : "Buscar produto"}</PremiumButton></div></div><PremiumInput variant="jornada" label="Nome do produto" value={form.hotmart_product_name} readOnly placeholder="Busque pelo UCODE para preencher" /><HotmartDropdown sort label="Tipo" value={form.destination_type} onChange={(value) => setForm({ ...form, destination_type: value, destination_id: "" })} options={[{ value: "jornada", label: "Jornada" }, { value: "event", label: "Evento" }]} /><HotmartDropdown sort label="Destino" value={form.destination_id} onChange={(value) => setForm({ ...form, destination_id: value })} options={[{ value: "", label: "Selecione" }, ...destinations.map((item) => ({ value: item.id, label: `${item.title || item.name} — ${item.status}` }))]} /></div>{form.hotmart_product_name ? <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Produto encontrado</p><p className="mt-1 font-semibold text-white">{form.hotmart_product_name}</p><p className="mt-1 break-all text-xs text-slate-400">{form.hotmart_product_ucode}</p></div> : null}<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><PremiumButton variant="dark-primary" disabled={savingMapping || lookingUpProduct} onClick={() => void createMapping()}>{savingMapping ? "Salvando..." : "Salvar vínculo"}</PremiumButton>{mappingFeedback ? <p role={mappingFeedback.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-2.5 text-sm ${mappingFeedback.tone === "success" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>{mappingFeedback.text}</p> : null}</div>{buyerPreview ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-orange-300/15 bg-orange-400/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="status"><div className="min-w-0 text-sm">{buyerPreview.state === "loading" ? <p className="text-slate-300">Verificando compradores anteriores de {buyerPreview.name}...</p> : buyerPreview.state === "error" ? <p className="text-amber-100">{buyerPreview.message} O vínculo continua salvo; tente novamente pelo botão do vínculo.</p> : buyerPreview.summary ? <p className="text-slate-200">{buyerPreview.summary.eligible} compradores aprovados encontrados · {buyerPreview.summary.already_inserted} já inseridos · {buyerPreview.summary.not_inserted} ainda não inseridos · {buyerPreview.summary.review} exigem revisão</p> : null}</div>{buyerPreview.state !== "loading" ? <PremiumButton variant="dark-primary" className="!min-h-0 shrink-0 !px-3 !py-2 !text-xs" onClick={() => setBuyersTarget({ id: buyerPreview.mappingId, name: buyerPreview.name })}>Ver compradores não inseridos</PremiumButton> : null}</div> : null}</PremiumCard></div><PremiumCard title="Produtos vinculados"><div className="space-y-3">{data.mappings.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-white">{item.hotmart_product_name}</p><p className="text-xs text-slate-400">{item.hotmart_product_ucode} → {item.jornadas?.title || item.simulado_events?.name}</p></div><div className="flex flex-wrap gap-2"><PremiumButton variant="dark-primary" onClick={() => setBuyersTarget({ id: item.id, name: item.hotmart_product_name })}>Ver compradores não inseridos</PremiumButton><PremiumButton variant="dark" onClick={() => void setMappingStatus(item.id, item.status === "active" ? "inactive" : "active")}>{item.status === "active" ? "Inativar" : "Ativar"}</PremiumButton><PremiumButton variant="dark-warning" onClick={() => void setMappingStatus(item.id, "archived")}>Arquivar</PremiumButton></div></div>)}{!data.mappings.length ? <p className="et-admin-dark-muted">Nenhum produto vinculado.</p> : null}</div></PremiumCard></div> : null}
    {!loading && tab === "pending" && commercialDateReviews.length ? <PremiumCard title="Datas comerciais em revisão" icon={<AlertTriangle size={18} />}><div className="space-y-3">{commercialDateReviews.map((item) => { const calculatedExpiresAt = calculatedCommercialExpiration(item); return <div key={`commercial-date-${item.id}`} className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Data da compra requer verificação</p><h3 className="mt-1 text-lg font-semibold text-white">{item.product_name_snapshot}</h3><p className="mt-1 break-all text-xs text-slate-400">UCODE: {item.hotmart_product_ucode}</p></div><PremiumButton variant="dark" onClick={() => void transactionAction(item.id, "reprocess")}>Reprocessar</PremiumButton></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div><p className="text-xs text-slate-500">Transação</p><p className="mt-1 text-sm text-slate-200">{item.transaction_code}</p></div><div><p className="text-xs text-slate-500">Comprador</p><p className="mt-1 text-sm text-slate-200">{item.students?.name || item.buyer_email}</p></div><div><p className="text-xs text-slate-500">Aprovação Hotmart</p><p className="mt-1 text-sm text-slate-200">{formatDate(item.purchase_approved_at)}</p></div><div><p className="text-xs text-slate-500">Expiração calculada</p><p className="mt-1 text-sm text-slate-200">{formatDate(calculatedExpiresAt)}</p></div><div><p className="text-xs text-slate-500">Jornada vinculada</p><p className="mt-1 text-sm text-slate-200">{item.jornadas?.title || "—"}</p></div></div><p className="mt-4 text-sm leading-6 text-amber-100">A Hotmart informou aprovação em {formatDate(item.purchase_approved_at)}. Com a duração atual da Jornada, o acesso expiraria em {formatDate(calculatedExpiresAt)}. Revise a transação antes de conceder o acesso.</p></div>; })}</div></PremiumCard> : null}
    {!loading && tab === "transactions" ? <div className="space-y-5">
      {/* "Filtrar transações" e "Transações" são PremiumCards irmãos; .et-admin-dark-panel usa
          backdrop-filter, que cria um stacking context por card — dois contextos irmãos empilham por
          ordem no DOM (o de baixo sempre por cima), nenhum z-index num descendente do primeiro furaria
          isso. Por isso o popover de "Data da compra" e os painéis de HotmartDropdown abaixo são
          portados para document.body (posição calculada por getBoundingClientRect), escapando de
          qualquer stacking context/overflow ancestral — não dependem mais de elevar o card inteiro. */}
      <PremiumCard title="Filtrar transações" icon={<Filter size={18} />}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <PremiumInput variant="jornada" label="Comprador" value={transactionFilters.buyer} onChange={(event: ChangeEvent<HTMLInputElement>) => setTransactionFilters((current) => ({ ...current, buyer: event.target.value }))} placeholder="Nome ou e-mail do comprador" />
          <PremiumInput variant="jornada" label="Número/código da transação" value={transactionFilters.code} onChange={(event: ChangeEvent<HTMLInputElement>) => setTransactionFilters((current) => ({ ...current, code: event.target.value }))} placeholder="Ex.: HP16015479281022" />
          <PremiumInput variant="jornada" label="Produto" value={transactionFilters.product} onChange={(event: ChangeEvent<HTMLInputElement>) => setTransactionFilters((current) => ({ ...current, product: event.target.value }))} placeholder="Nome do produto ou UCODE" />
          <HotmartDropdown label="Tipo de destino" value={transactionFilters.destinationType} onChange={(value) => setTransactionFilters((current) => ({ ...current, destinationType: value as TransactionFilters["destinationType"] }))} options={[{ value: "all", label: "Todos" }, { value: "jornada", label: "Jornada" }, { value: "event", label: "Evento" }, { value: "unlinked", label: "Não vinculado" }]} />
          <HotmartDropdown label="Destino vinculado" value={transactionFilters.destinationName} onChange={(value) => setTransactionFilters((current) => ({ ...current, destinationName: value }))} options={[{ value: "", label: "Todos" }, ...destinationNameOptions.map((name) => ({ value: name, label: name }))]} />
          <div className="relative" ref={dateRangeRef}>
            <label className="et-admin-dark-label mb-2 flex items-center gap-2">Data da compra</label>
            <button type="button" onClick={() => setDateRangeOpen((current) => !current)} className={`et-admin-dark-input flex h-12 w-full items-center justify-between gap-2 px-4 text-left text-sm outline-none transition focus:border-orange-400/50 focus:ring-4 focus:ring-orange-500/10 ${dateRangeOpen ? "border-orange-400/50 ring-4 ring-orange-500/10" : ""}`}>
              <span className={`truncate ${transactionFilters.dateFrom || transactionFilters.dateTo ? "text-white" : "text-slate-600"}`}>
                {transactionFilters.dateFrom && transactionFilters.dateTo ? `${formatDate(transactionFilters.dateFrom)} – ${formatDate(transactionFilters.dateTo)}`
                  : transactionFilters.dateFrom ? `A partir de ${formatDate(transactionFilters.dateFrom)}`
                  : transactionFilters.dateTo ? `Até ${formatDate(transactionFilters.dateTo)}`
                  : "Todas as datas"}
              </span>
              <Calendar size={16} className={`shrink-0 transition ${dateRangeOpen ? "text-orange-300" : "text-slate-500"}`} />
            </button>
            {dateRangeOpen && dateRangeRect ? createPortal(
              <div ref={dateRangePanelRef} style={{ position: "fixed", top: dateRangeRect.top, left: dateRangeRect.left, width: Math.max(dateRangeRect.width, 288) }} className="et-admin-dark-panel z-[9999] p-4">
                <div className="grid grid-cols-2 gap-3">
                  <PremiumInput variant="jornada" type="date" label="De" className="[color-scheme:dark]" value={transactionFilters.dateFrom} onChange={(event: ChangeEvent<HTMLInputElement>) => setTransactionFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
                  <PremiumInput variant="jornada" type="date" label="Até" className="[color-scheme:dark]" value={transactionFilters.dateTo} onChange={(event: ChangeEvent<HTMLInputElement>) => setTransactionFilters((current) => ({ ...current, dateTo: event.target.value }))} />
                </div>
                <div className="mt-3 flex justify-between gap-2 border-t border-white/[0.065] pt-3">
                  <PremiumButton variant="dark" className="!min-h-0 !px-3 !py-1.5 !text-xs" onClick={() => setTransactionFilters((current) => ({ ...current, dateFrom: "", dateTo: "" }))}>Limpar</PremiumButton>
                  <PremiumButton variant="dark-primary" className="!min-h-0 !px-3 !py-1.5 !text-xs" onClick={() => setDateRangeOpen(false)}>Aplicar</PremiumButton>
                </div>
              </div>,
              document.body,
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.065] pt-4">
          <p className="et-admin-dark-muted text-sm">{filteredTransactions.length} de {data.transactions.length} {data.transactions.length === 1 ? "transação" : "transações"}</p>
          <PremiumButton variant="dark" onClick={() => setTransactionFilters(emptyTransactionFilters)}>Limpar filtros</PremiumButton>
        </div>
      </PremiumCard>
      <PremiumCard title="Transações" icon={<CreditCard size={18} />}>
        <div className="space-y-2">
          {filteredTransactions.map((transaction) => renderTransactionRow(transaction))}
          {!filteredTransactions.length ? <p className="et-admin-dark-muted">Nenhuma transação encontrada com os filtros atuais.</p> : null}
        </div>
      </PremiumCard>
    </div> : null}
    {!loading && ["pending","duplicates"].includes(tab) ? <PremiumCard title={tab === "pending" ? "Pendências" : "Compras em duplicidade"}><div className="space-y-4">{(tab === "pending" ? pending.filter((item) => item.processing_error_code !== "COMMERCIAL_DATE_REQUIRES_REVIEW") : duplicates).map((item) => renderTransactionCard(item))}{!(tab === "pending" ? pending : duplicates).length ? <p className="et-admin-dark-muted">Nenhum registro nesta seção.</p> : null}</div></PremiumCard> : null}
    {!loading && tab === "students" ? <PremiumCard title="Possíveis cadastros duplicados"><div className="space-y-3">{duplicateStudents.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="font-semibold text-white">Conta Hotmart: {item.students?.name || item.students?.email}</p><p className="mt-1 text-xs text-slate-400">Possível cadastro existente: {item.possible_duplicate?.name || item.possible_duplicate?.email}</p><div className="mt-3 flex gap-2"><PremiumButton variant="dark" onClick={() => void transactionAction(item.id, "keep_separate")}>Manter separados</PremiumButton><PremiumButton variant="dark-danger" disabled>Mesclar — bloqueado</PremiumButton></div></div>)}{!duplicateStudents.length ? <p className="et-admin-dark-muted">Nenhuma possível duplicidade pendente.</p> : null}<p className="et-admin-dark-muted mt-4">O merge permanece indisponível até que todas as relações críticas e o Supabase Auth possam ser migrados de forma transacional.</p></div></PremiumCard> : null}
    {!loading && tab === "history" ? <PremiumCard title="Histórico comercial" icon={<ScrollText size={18} />}><div className="space-y-2">{data.history.map((item) => <div key={item.id} className="flex justify-between rounded-xl border border-white/10 px-4 py-3 text-sm"><span className="text-slate-200">{item.action}</span><span className="text-slate-500">{new Date(item.created_at).toLocaleString("pt-BR")}</span></div>)}</div></PremiumCard> : null}
    {buyersTarget ? <HotmartBuyersModal key={buyersTarget.id} mappingId={buyersTarget.id} productName={buyersTarget.name} onClose={closeBuyers} onImported={() => void load(true)} /> : null}
    {catalogSource === "sandbox" ? <HotmartCatalogModal source="sandbox" products={sandboxProducts} loading={loadingSandboxProducts} error={sandboxProductsError} copiedUcode={copiedUcode} copyFailedUcode={copyFailedUcode} onCopy={(ucode) => void copyUcode(ucode)} onUse={(product) => fillProductFromCatalog(product, "sandbox")} onClose={closeCatalog} /> : null}
    {catalogSource === "production" ? <HotmartCatalogModal source="production" products={productionProducts} loading={loadingProductionProducts} error={productionProductsError} copiedUcode={copiedUcode} copyFailedUcode={copyFailedUcode} onCopy={(ucode) => void copyUcode(ucode)} onUse={(product) => fillProductFromCatalog(product, "production")} onClose={closeCatalog} /> : null}
    <PremiumModal open={Boolean(mappingTarget)} title="Vincular produto Hotmart" message="Escolha o destino EstudoTOP para esta compra. O produto e o código vieram da transação e não podem ser alterados neste fluxo." tone="info" dismissible={!savingPendingMapping} onClose={() => { if (!savingPendingMapping) setMappingTarget(null); }} actions={<><PremiumButton variant="dark" disabled={savingPendingMapping} onClick={() => setMappingTarget(null)}>Cancelar</PremiumButton><PremiumButton variant={mappingTarget && HOTMART_REPROCESS_ELIGIBLE_STATUSES.includes(mappingTarget.processing_status) ? "dark" : "dark-primary"} disabled={savingPendingMapping || !pendingMappingForm.destination_id} onClick={() => void savePendingMapping(false)}>{savingPendingMapping ? "Salvando..." : "Salvar vínculo"}</PremiumButton>{mappingTarget && HOTMART_REPROCESS_ELIGIBLE_STATUSES.includes(mappingTarget.processing_status) ? <PremiumButton variant="dark-primary" disabled={savingPendingMapping || !pendingMappingForm.destination_id} onClick={() => void savePendingMapping(true)}>{savingPendingMapping ? "Processando..." : "Vincular e reprocessar"}</PremiumButton> : null}</>}>
      <div className="grid gap-4 md:grid-cols-2"><PremiumInput variant="jornada" label="Produto Hotmart" value={mappingTarget?.product_name_snapshot || ""} readOnly /><PremiumInput variant="jornada" label="Código do produto" value={mappingTarget?.hotmart_product_ucode || ""} readOnly /><HotmartDropdown sort label="Tipo de destino" value={pendingMappingForm.destination_type} disabled={savingPendingMapping} onChange={(value) => setPendingMappingForm({ destination_type: value, destination_id: "" })} options={[{ value: "jornada", label: "Jornada" }, { value: "event", label: "Evento" }]} /><HotmartDropdown sort label={pendingMappingForm.destination_type === "jornada" ? "Jornada" : "Evento"} value={pendingMappingForm.destination_id} disabled={savingPendingMapping} onChange={(value) => setPendingMappingForm({ ...pendingMappingForm, destination_id: value })} options={[{ value: "", label: "Selecione" }, ...pendingMappingDestinations.map((item) => ({ value: item.id, label: item.title || item.name || "" }))]} /></div>
    </PremiumModal>
    {selectedTransaction ? (() => {
      const transaction = selectedTransaction;
      const flags = deriveTransactionFlags(transaction, data.mappings);
      const access = transaction.hotmart_access_links?.[0];
      const accessStarted = access?.student_jornadas?.started_at || access?.access_started_at;
      const accessExpires = access?.student_jornadas?.expires_at || access?.access_expires_at;
      const accessStatus = accessStateLabel(access?.student_jornadas?.status || access?.simulado_event_participants?.access_status || access?.access_state);
      const purchaseValue = formatCurrencyAmount(transaction.amount, transaction.currency);
      const purchaseValueNeedsCurrency = purchaseValue === null && transaction.amount !== null && transaction.amount !== undefined && !Number.isNaN(Number(transaction.amount));
      const processingTone = processingStatusTone(transaction.processing_status, transaction.refund_request_state, transaction.processing_error_code);
      return <PremiumModal open theme="dark" size="wide" tone="info" dismissible onClose={() => setSelectedTransaction(null)} title={transaction.product_name_snapshot || "Produto não identificado"} message={`Transação ${transaction.transaction_code}`} actions={<>
        <PremiumButton variant="dark" onClick={() => setSelectedTransaction(null)}>Fechar</PremiumButton>
        <PremiumButton variant="dark" onClick={() => void copyUcode(transaction.hotmart_product_ucode)}>{copiedUcode === transaction.hotmart_product_ucode ? "UCODE copiado" : "Copiar UCODE"}</PremiumButton>
        {flags.canLink ? <PremiumButton variant="dark-primary" icon={<Link2 size={16} />} onClick={() => { setSelectedTransaction(null); openMappingModal(transaction); }}>Vincular</PremiumButton> : null}
        {flags.canReprocess ? <PremiumButton variant="dark" onClick={() => void transactionAction(transaction.id, "reprocess")}>Reprocessar</PremiumButton> : null}
        {flags.canExtend ? <PremiumButton variant="dark-success" onClick={() => void transactionAction(transaction.id, "extend_jornada")}>Estender matrícula</PremiumButton> : null}
        {flags.canRefund ? <PremiumButton variant="dark-warning" onClick={() => void transactionAction(transaction.id, "refund")}>Solicitar estorno</PremiumButton> : null}
      </>}>
        <div className="grid gap-5 md:grid-cols-2">
          <DetailSection label="Dados da transação">
            <DetailRow label="Código" value={<span className="font-mono text-xs">{transaction.transaction_code}</span>} />
          </DetailSection>
          <DetailSection label="Dados do produto">
            <DetailRow label="Produto" value={transaction.product_name_snapshot || "Produto não identificado"} />
            <DetailRow label="UCODE" value={<span className="font-mono text-xs">{transaction.hotmart_product_ucode}</span>} />
          </DetailSection>
          <DetailSection label="Dados do comprador">
            <DetailRow label="Nome" value={transaction.students?.name} />
            <DetailRow label="E-mail" value={transaction.buyer_email} />
            <DetailRow label="Documento" value={transaction.buyer_document} />
            <DetailRow label="Telefone" value={transaction.buyer_phone} />
          </DetailSection>
          <DetailSection label="Situação comercial">
            <div><span className={`et-admin-dark-badge et-admin-dark-badge-${purchaseStatusTone(transaction.purchase_status)}`}>{purchaseStatusLabel(transaction.purchase_status)}</span></div>
            {purchaseValue ? <DetailRow label="Valor" value={purchaseValue} /> : purchaseValueNeedsCurrency ? <DetailRow label="Valor" value={`${formatPlainAmount(transaction.amount)} (moeda não informada)`} /> : null}
          </DetailSection>
          <DetailSection label="Situação no EstudoTOP">
            <div><span className={`et-admin-dark-badge et-admin-dark-badge-${processingTone}`}>{flags.situationLabel}</span></div>
            {flags.situationHelper ? <p className="text-xs text-slate-500">{flags.situationHelper}</p> : null}
            <DetailRow label="Erro" value={transaction.processing_error_message} />
          </DetailSection>
          <DetailSection label="Vínculo / destino">
            {flags.linkState === "linked" ? <>
              <div><span className="et-admin-dark-badge et-admin-dark-badge-success">Vinculado</span></div>
              <DetailRow label={flags.destinationTypeLabel} value={flags.destinationName} />
              {accessStatus && accessStatus !== "Ativo" ? <DetailRow label="Situação do acesso" value={accessStatus} /> : null}
            </> : flags.linkState === "destination_unavailable" ? <>
              <div><span className="et-admin-dark-badge et-admin-dark-badge-warning">Destino indisponível</span></div>
              <p className="text-xs text-slate-500">O produto está vinculado, mas o destino não pôde ser resolvido. Revise em Produtos vinculados.</p>
            </> : flags.linkState === "mapping_inactive" ? <>
              <div><span className="et-admin-dark-badge et-admin-dark-badge-warning">Vínculo inativo</span></div>
              <p className="text-xs text-slate-500">Existe um vínculo para este produto, mas está inativo/arquivado. Reative em Produtos vinculados.</p>
            </> : <>
              <div><span className="et-admin-dark-badge et-admin-dark-badge-neutral">Produto não vinculado</span></div>
              <p className="text-xs text-slate-500">Destino: Nenhum</p>
            </>}
          </DetailSection>
          <DetailSection label="Datas relevantes">
            <DetailRow label="Recebida em" value={formatDateTime(transaction.created_at)} />
            <DetailRow label="Aprovada em" value={formatDateTime(transaction.purchase_approved_at) || "—"} />
            <DetailRow label="Criada em (Hotmart)" value={formatDateTime(transaction.purchase_created_at) || "—"} />
            {accessStarted ? <DetailRow label="Entrada no destino" value={formatDate(accessStarted)} /> : null}
            {accessExpires ? <DetailRow label="Expira em" value={formatDate(accessExpires)} /> : null}
            {transaction.resolved_at ? <DetailRow label="Resolvida em" value={formatDateTime(transaction.resolved_at)} /> : null}
          </DetailSection>
        </div>
      </PremiumModal>;
    })() : null}
  </PageBackground>;
}
