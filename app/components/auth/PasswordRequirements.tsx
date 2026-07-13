"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { getPasswordRuleResults, type PasswordPolicyContext, type PasswordRuleId } from "@/lib/auth/passwordPolicy";

const PROHIBITED_RULES = new Set<PasswordRuleId>(["number_sequence", "repeated_characters", "personal_data"]);

export function PasswordRequirements({ password, context, serverViolations = [], dark = false }: { password: string; context?: PasswordPolicyContext; serverViolations?: string[]; dark?: boolean }) {
  const rules = getPasswordRuleResults(password, context);
  return (
    <div className={`rounded-2xl border p-4 ${dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50"}`} aria-label="Requisitos da senha">
      <p className={`text-xs font-bold uppercase tracking-[0.16em] ${dark ? "text-slate-300" : "text-slate-600"}`}>Sua senha deve conter:</p>
      <ul className="mt-3 space-y-2">
        {rules.map((rule) => {
          const serverRejected = serverViolations.includes(rule.id);
          const passed = password.length > 0 && rule.passed && !serverRejected;
          const explicitlyViolated = password.length > 0 && !passed && (PROHIBITED_RULES.has(rule.id) || serverRejected);
          const Icon = passed ? CheckCircle2 : explicitlyViolated ? XCircle : Circle;
          const color = passed ? "text-emerald-500" : explicitlyViolated ? "text-red-500" : dark ? "text-slate-500" : "text-slate-400";
          return <li key={rule.id} className={`flex items-start gap-2 text-xs ${color}`} aria-label={`${passed ? "Atendido" : explicitlyViolated ? "Não permitido" : "Pendente"}: ${rule.label}`}><Icon className="mt-0.5 shrink-0" size={15} /><span>{rule.label}</span></li>;
        })}
      </ul>
    </div>
  );
}
