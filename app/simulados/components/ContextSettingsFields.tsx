"use client";

import { useId } from "react";
import { Info } from "lucide-react";
import PremiumInput from "@/app/components/ui/PremiumInput";
import PremiumSimpleSelect from "@/app/components/ui/PremiumSimpleSelect";

export type ContextSettingsForm = {
  feedback_mode: "instant" | "final_only";
  navigation_override: "open" | "closed" | null;
  owl_help_enabled: boolean;
  owl_help_limit: number | null;
  result_policy?: "blocked" | "released";
};

export const defaultContextSettings: ContextSettingsForm = { feedback_mode: "final_only", navigation_override: null, owl_help_enabled: false, owl_help_limit: null };

export default function ContextSettingsFields({ value, onChange, jornada = false }: {
  value: ContextSettingsForm;
  onChange: (patch: Partial<ContextSettingsForm>) => void;
  jornada?: boolean;
}) {
  const id = useId();
  const help = "Feedback imediato corrige cada resposta confirmada e exige navegação fechada neste contexto. Ao final, a correção fica disponível após a liberação do resultado. A exceção de navegação não altera o Simulado original nem outros contextos. A Coruja usa um saldo próprio por tentativa.";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="group relative md:col-span-2">
        <span tabIndex={0} aria-describedby={id} aria-label="Como funcionam as configurações deste contexto" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 outline-none focus:text-orange-300">
          <Info size={16} /> Configurações desta aplicação
        </span>
        <p id={id} role="tooltip" className="absolute z-20 hidden max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs leading-5 text-slate-200 shadow-lg group-hover:block group-focus-within:block">{help}</p>
      </div>
      <PremiumSimpleSelect dark label="Feedback" value={value.feedback_mode} options={[["final_only", "Ao final, conforme a liberação"], ["instant", "Imediato, após confirmar cada resposta"]]} onChange={(selected) => {
        const mode = selected as ContextSettingsForm["feedback_mode"];
        onChange({ feedback_mode: mode, ...(mode === "instant" ? { navigation_override: "closed" as const } : {}) });
      }} />
      <PremiumSimpleSelect dark label="Navegação nesta aplicação" value={value.feedback_mode === "instant" ? "closed" : value.navigation_override ?? "original"} disabled={value.feedback_mode === "instant"} options={[["original", "Usar a navegação original do Simulado"], ["open", "Exceção: aberta"], ["closed", "Exceção: fechada"]]} onChange={(selected) => onChange({ navigation_override: selected === "original" ? null : selected as "open" | "closed" })} />
      <PremiumSimpleSelect dark label="Ajuda da Coruja — padrão do contexto" value={value.owl_help_enabled ? "enabled" : "disabled"} options={[["disabled", "Desabilitada"], ["enabled", "Habilitada"]]} onChange={(selected) => onChange({ owl_help_enabled: selected === "enabled", owl_help_limit: selected === "enabled" ? value.owl_help_limit ?? 1 : null })} />
      {value.owl_help_enabled && <PremiumInput variant="jornada" label="Ajudas por tentativa" type="number" min={1} step={1} value={value.owl_help_limit ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ owl_help_limit: event.target.value ? Number(event.target.value) : null })} />}
      {jornada && <PremiumSimpleSelect dark label="Liberação de resultados" value={value.result_policy ?? "released"} options={[["released", "Liberar após a conclusão"], ["blocked", "Bloquear até liberação administrativa"]]} onChange={(selected) => onChange({ result_policy: selected as "blocked" | "released" })} />}
      {jornada && <p className="text-xs leading-5 text-slate-400 md:col-span-2">O padrão da Coruja pode ser substituído por vínculo. Resultados já liberados permanecem disponíveis, mesmo se a política passar a bloqueada. A liberação inclui revisão e TopCoins elegíveis.</p>}
    </div>
  );
}
