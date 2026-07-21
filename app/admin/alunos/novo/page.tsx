"use client";

import { ChangeEvent, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Mail,
  Phone,
  Send,
  Shield,
  UserRound,
  X,
} from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import PremiumLoadingOverlay from "@/app/components/ui/PremiumLoadingOverlay";
import { adminFetch } from "@/lib/supabase/adminFetch";
import { formatCpf, isValidCpf, onlyDigits } from "@/lib/utils/cpf";

type SubmitState =
  | { type: "idle"; message: "" }
  | { type: "success"; message: string; studentId?: string }
  | { type: "warning"; message: string; studentId?: string }
  | { type: "duplicate"; message: string; existingStudent: { id: string; fullName: string } }
  | { type: "error"; message: string };

export default function NovoAlunoAdminPage() {
  const [submitting, setSubmitting] = useState(false);
  const [cpf, setCpf] = useState("");
  const [cpfTouched, setCpfTouched] = useState(false);
  const [desiredContests, setDesiredContests] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<SubmitState>({ type: "idle", message: "" });

  const cpfDigits = onlyDigits(cpf);
  const cpfInvalid = cpfTouched && cpfDigits.length > 0 && !isValidCpf(cpfDigits);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const cpfClean = onlyDigits(String(form.get("cpf") || ""));

    if (!cpfClean || !isValidCpf(cpfClean)) {
      setCpfTouched(true);
      setState({
        type: "error",
        message: !cpfClean ? "CPF é obrigatório." : "CPF inválido. Verifique os dígitos informados.",
      });
      return;
    }

    setSubmitting(true);
    setState({ type: "idle", message: "" });

    const payload = {
      fullName: String(form.get("fullName") || ""),
      email: String(form.get("email") || ""),
      cpf: cpfClean,
      phone: String(form.get("phone") || ""),
      origin: String(form.get("origin") || "Manual"),
      notes: String(form.get("notes") || ""),
      desiredContests: String(form.get("desiredContests") || ""),
      isActive: form.get("isActive") === "on",
    };

    try {
      const response = await adminFetch("/api/admin/students/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.status === 409 && result.existingStudent) {
        setState({
          type: "duplicate",
          message: result.message || "Cadastro já existente.",
          existingStudent: result.existingStudent,
        });
        return;
      }

      if (!response.ok || !result.ok) {
        setState({ type: "error", message: result.message || "Falha ao cadastrar aluno." });
        return;
      }

      setState({
        type: result.emailSent ? "success" : "warning",
        message: result.message || "Aluno cadastrado.",
        studentId: result.studentId,
      });

      formElement.reset();
      setCpf("");
      setCpfTouched(false);
      setDesiredContests("");
      setNotes("");
    } catch (error) {
      setState({
        type: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar aluno.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="et-dark-admin-page relative isolate min-h-screen overflow-hidden bg-[#03070D] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_0%,rgba(249,115,22,0.12),transparent_30%),radial-gradient(circle_at_78%_5%,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,#03070D_0%,#050B14_48%,#03070D_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]">
      </div>
      <PremiumLoadingOverlay
        show={submitting}
        title="Cadastrando aluno..."
        message="Criando cadastro e enviando link de confirmação por e-mail."
      />

      {/* Page header */}
      <div className="relative mx-auto max-w-4xl px-6 pb-6 pt-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
          EstudoTOP Simulados
        </p>
        <div className="relative isolate overflow-hidden rounded-[1.35rem] border border-white/[0.11] bg-[#07111F]/80 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl md:p-7">
          <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_8%_20%,rgba(249,115,22,0.18),transparent_24%),radial-gradient(circle_at_85%_8%,rgba(37,99,235,0.18),transparent_32%),linear-gradient(135deg,#05080D,#061426_48%,#05080D)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Cadastrar aluno</h1>
            <p className="mt-2 text-sm text-white/45">
              Cadastre o aluno e envie um link de confirmação válido por 72 horas.
            </p>
          </div>
          <Link href="/admin/alunos">
            <PremiumButton variant="secondary" icon={<ArrowLeft size={18} />}>
              Voltar
            </PremiumButton>
          </Link>
        </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-4xl px-6 pb-12">
        {state.type !== "idle" && <DarkNotice state={state} />}

        {/* Main card */}
        <div className="relative isolate rounded-[2rem] border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm">
          <div className="pointer-events-none absolute -inset-[1px] -z-10 rounded-[2rem] bg-gradient-to-b from-orange-400/[0.07] via-white/[0.02] to-transparent blur-[16px]" />

          {/* Card header */}
          <div className="flex items-start gap-4 border-b border-white/[0.06] px-8 py-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 ring-1 ring-orange-500/20">
              <UserRound size={20} className="text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Dados do aluno</h2>
              <p className="mt-0.5 text-sm text-white/40">
                Preencha os dados essenciais. O CPF é obrigatório e será validado para evitar cadastros
                duplicados.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6 px-8 py-7">
              {/* Row 1: Nome + E-mail */}
              <div className="grid gap-5 md:grid-cols-2">
                <DarkField label="Nome completo">
                  <DarkInput
                    name="fullName"
                    placeholder="Ex.: Maria da Silva"
                    required
                    iconLeft={<UserRound size={15} />}
                  />
                </DarkField>
                <DarkField label="E-mail">
                  <DarkInput
                    name="email"
                    type="email"
                    placeholder="aluno@email.com"
                    required
                    iconLeft={<Mail size={15} />}
                  />
                </DarkField>
              </div>

              {/* Row 2: CPF + WhatsApp + Origem */}
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <DarkField label="CPF obrigatório">
                    <DarkInput
                      name="cpf"
                      value={cpf}
                      onChange={(e) => setCpf(formatCpf(e.target.value))}
                      onBlur={() => setCpfTouched(true)}
                      placeholder="000.000.000-00"
                      required
                      iconLeft={<Shield size={15} />}
                      error={cpfInvalid}
                    />
                  </DarkField>
                  {cpfInvalid && (
                    <p className="mt-1.5 text-xs font-semibold text-red-400">
                      CPF inválido. Verifique os dígitos.
                    </p>
                  )}
                </div>
                <DarkField label="WhatsApp">
                  <DarkInput
                    name="phone"
                    placeholder="(31) 99999-9999"
                    iconLeft={<Phone size={15} />}
                  />
                </DarkField>
                <DarkField label="Origem">
                  <DarkSelect name="origin" defaultValue="Manual">
                    <option value="Manual">Manual</option>
                    <option value="Instagram">Instagram</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Hotmart">Hotmart</option>
                    <option value="Indicação">Indicação</option>
                  </DarkSelect>
                </DarkField>
              </div>

              {/* Concursos desejados */}
              <DarkField label="Concursos desejados">
                <DarkTextarea
                  name="desiredContests"
                  value={desiredContests}
                  onChange={(e) => setDesiredContests(e.target.value)}
                  placeholder="Ex.: TJSP, Polícia Federal, GCM SP, Prefeitura de Contagem..."
                  maxLength={200}
                  rows={3}
                />
              </DarkField>

              {/* Observações internas */}
              <DarkField label="Observações internas">
                <DarkTextarea
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Inclua observações úteis para atendimento, suporte ou liberação futura."
                  maxLength={500}
                  rows={4}
                />
              </DarkField>

              {/* Aluno ativo */}
              <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 transition duration-150 hover:bg-white/[0.05]">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked
                  className="h-5 w-5 cursor-pointer accent-orange-500"
                />
                <div>
                  <p className="text-sm font-semibold text-white">Aluno ativo</p>
                  <p className="text-xs text-white/40">
                    Alunos inativos não devem acessar a plataforma.
                  </p>
                </div>
              </label>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] px-8 py-5">
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Shield size={13} />
                <span>Os dados estão protegidos e criptografados.</span>
              </div>
              <div className="flex gap-3">
                <Link href="/admin/alunos">
                  <PremiumButton variant="secondary">Cancelar</PremiumButton>
                </Link>
                <PremiumButton type="submit" icon={<Send size={16} />} disabled={submitting}>
                  Cadastrar aluno e enviar confirmação
                </PremiumButton>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────

function DarkField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
        {label}
      </label>
      {children}
    </div>
  );
}

function DarkInput({
  name,
  type = "text",
  value,
  onChange,
  onBlur,
  defaultValue,
  placeholder,
  required,
  iconLeft,
  error,
}: {
  name: string;
  type?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  iconLeft?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className="relative">
      {iconLeft && (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
          {iconLeft}
        </span>
      )}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className={`h-12 w-full rounded-2xl border bg-white/[0.04] ${iconLeft ? "pl-10" : "pl-4"} pr-4 text-sm font-medium text-white/80 outline-none transition duration-200 placeholder:text-white/25 hover:border-white/[0.14] focus:ring-4 ${
          error
            ? "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/10"
            : "border-white/[0.08] focus:border-orange-500/50 focus:ring-orange-500/10"
        }`}
      />
    </div>
  );
}

function DarkSelect({
  name,
  defaultValue,
  value,
  onChange,
  children,
}: {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        className="h-12 w-full appearance-none rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-4 pr-10 text-sm font-medium text-white/80 outline-none transition duration-200 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 [color-scheme:dark]"
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/30"
      />
    </div>
  );
}

function DarkTextarea({
  name,
  value,
  onChange,
  defaultValue,
  placeholder,
  maxLength,
  rows = 3,
}: {
  name: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 pb-7 pt-3 text-sm font-medium text-white/80 outline-none transition duration-200 placeholder:text-white/25 hover:border-white/[0.14] focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
      />
      {maxLength !== undefined && value !== undefined && (
        <span className="pointer-events-none absolute bottom-3 right-4 text-xs text-white/25">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}

function DarkNotice({ state }: { state: Exclude<SubmitState, { type: "idle"; message: "" }> }) {
  const isSuccess = state.type === "success";
  const isWarning = state.type === "warning";
  const isDuplicate = state.type === "duplicate";

  const cfg = isSuccess
    ? {
        border: "border-emerald-500/20",
        bg: "bg-emerald-500/[0.07]",
        text: "text-emerald-400",
        icon: <CheckCircle2 size={19} />,
        title: "Cadastro concluído",
      }
    : isWarning
      ? {
          border: "border-amber-500/20",
          bg: "bg-amber-500/[0.07]",
          text: "text-amber-400",
          icon: <AlertTriangle size={19} />,
          title: "Aluno criado com alerta",
        }
      : isDuplicate
        ? {
            border: "border-orange-500/20",
            bg: "bg-orange-500/[0.07]",
            text: "text-orange-400",
            icon: <AlertTriangle size={19} />,
            title: "Cadastro já existente",
          }
        : {
            border: "border-red-500/20",
            bg: "bg-red-500/[0.07]",
            text: "text-red-400",
            icon: <X size={19} />,
            title: "Erro no cadastro",
          };

  return (
    <div className={`mb-6 rounded-[1.5rem] border ${cfg.border} ${cfg.bg} p-5`}>
      <div className="flex gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ${cfg.text}`}
        >
          {cfg.icon}
        </div>
        <div>
          <p className={`text-base font-semibold ${cfg.text}`}>{cfg.title}</p>
          <p className="mt-1 text-sm text-white/55">{state.message}</p>
          {state.type === "duplicate" && (
            <div className="mt-3">
              <p className="text-sm text-white/55">
                Aluno encontrado:{" "}
                <span className="font-semibold text-white/80">{state.existingStudent.fullName}</span>
              </p>
              <Link href={`/admin/alunos/${state.existingStudent.id}`} className="mt-3 inline-flex">
                <PremiumButton variant="secondary">Abrir cadastro existente</PremiumButton>
              </Link>
            </div>
          )}
          {(state.type === "success" || state.type === "warning") && state.studentId && (
            <Link href={`/admin/alunos/${state.studentId}`} className="mt-3 inline-flex">
              <PremiumButton variant="secondary">Ver cadastro do aluno</PremiumButton>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
