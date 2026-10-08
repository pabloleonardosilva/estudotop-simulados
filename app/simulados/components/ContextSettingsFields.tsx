"use client";

import { useId, type ReactNode } from "react";
import { Info, SlidersHorizontal } from "lucide-react";
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

// Contraste dos controles restrito aos painéis da Jornada: os componentes globais
// (e os Eventos, que usam este mesmo formulário) mantêm a aparência original.
// Nos inputs, "!" é necessário porque .et-admin-dark-input é CSS global fora das
// camadas do Tailwind e venceria os utilitários.
const jornadaFieldTone = [
  "[&_label]:text-slate-300/85",
  "[&_button[aria-haspopup=listbox]]:bg-white/[0.045] [&_button[aria-haspopup=listbox]]:px-3 [&_button[aria-haspopup=listbox]]:text-white/90",
  "[&_input]:bg-white/[0.045]! [&_input]:pl-3",
  "[&_button[aria-haspopup=listbox]:not(:focus)]:border-white/[0.12] [&_input:not(:focus)]:border-white/[0.12]!",
  "[&_button[aria-haspopup=listbox]:hover:not(:disabled):not(:focus)]:border-white/[0.2] [&_input:hover:not(:disabled):not(:focus)]:border-white/[0.2]!",
  "[&_input:focus]:border-orange-400/50!",
  "[&_button[aria-haspopup=listbox]:focus]:shadow-[0_0_0_3px_rgba(249,115,22,0.14)] [&_input:focus]:shadow-[0_0_0_3px_rgba(249,115,22,0.14)]",
].join(" ");

// Faixas sem sobreposição: com min-[1360px] e md juntos, a ordem gerada pelo Tailwind faria md vencer.
export const jornadaPanelGrid = "grid items-start gap-x-3 gap-y-5 md:max-[1359px]:grid-cols-2 min-[1360px]:grid-cols-3";

export function JornadaSettingsPanel({ icon, title, titleAddon, children, footer }: {
  icon: ReactNode;
  title: string;
  titleAddon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={`rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${jornadaFieldTone}`}>
      <div className="relative mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-500/10 text-orange-300">{icon}</span>
        <h3 className="et-admin-dark-card-title">{title}</h3>
        {titleAddon}
      </div>
      {children}
      {footer && <div className="mt-5 border-t border-white/[0.06] pt-4 text-xs leading-5 text-slate-400">{footer}</div>}
    </section>
  );
}

export default function ContextSettingsFields({ value, onChange, jornada = false, attemptsControl }: {
  value: ContextSettingsForm;
  onChange: (patch: Partial<ContextSettingsForm>) => void;
  jornada?: boolean;
  attemptsControl?: ReactNode;
}) {
  const id = useId();
  const help = "Feedback imediato corrige cada resposta confirmada e exige navegação fechada neste contexto. Ao final, a correção fica disponível após a liberação do resultado. A navegação escolhida aqui não altera o Simulado original nem outros contextos. A Coruja usa um saldo próprio por tentativa.";
  const instant = value.feedback_mode === "instant";
  // O tooltip cobre a primeira linha de campos: abre só pelo próprio gatilho e nunca captura cliques.
  const tooltip = (placement = "") => <p id={id} role="tooltip" className={`pointer-events-none absolute z-20 hidden max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs leading-5 text-slate-200 shadow-lg peer-hover:block peer-focus:block ${placement}`}>{help}</p>;
  const fields = (
    <>
      <PremiumSimpleSelect dark label="Feedback" value={value.feedback_mode} options={[["final_only", "Ao final, conforme a liberação"], ["instant", "Imediato, após confirmar cada resposta"]]} onChange={(selected) => {
        const mode = selected as ContextSettingsForm["feedback_mode"];
        onChange({ feedback_mode: mode, ...(mode === "instant" ? { navigation_override: "closed" as const } : {}) });
      }} />
      <div>
        <PremiumSimpleSelect dark label="Navegação nesta aplicação" value={instant ? "closed" : value.navigation_override ?? "original"} disabled={instant} options={[["original", "Herdar do Simulado"], ["open", "Navegação aberta"], ["closed", "Navegação fechada"]]} onChange={(selected) => onChange({ navigation_override: selected === "original" ? null : selected as "open" | "closed" })} />
        {instant && <p className="mt-2 text-xs leading-5 text-slate-400">Feedback imediato exige navegação fechada. Para escolher outra navegação, altere o Feedback.</p>}
      </div>
      {attemptsControl && (
        <div role="group" aria-labelledby={`${id}-attempts`}>
          <label id={`${id}-attempts`} className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Tentativas permitidas</label>
          {attemptsControl}
          <p className="mt-2 text-xs leading-5 text-slate-400">Quantidade permitida em cada Simulado desta Jornada.</p>
        </div>
      )}
      <PremiumSimpleSelect dark label="Ajuda da Coruja" value={value.owl_help_enabled ? "enabled" : "disabled"} options={[["disabled", "Desabilitada"], ["enabled", "Habilitada"]]} onChange={(selected) => onChange({ owl_help_enabled: selected === "enabled", owl_help_limit: selected === "enabled" ? value.owl_help_limit ?? 1 : null })} />
      {value.owl_help_enabled && (
        <div>
          <label htmlFor={`${id}-owl-limit`} className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Ajudas por tentativa</label>
          <PremiumInput id={`${id}-owl-limit`} variant="jornada" type="number" min={1} step={1} value={value.owl_help_limit ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ owl_help_limit: event.target.value ? Number(event.target.value) : null })} />
        </div>
      )}
      {jornada && <PremiumSimpleSelect dark label="Liberação de resultados" value={value.result_policy ?? "released"} options={[["released", "Liberar após a conclusão"], ["blocked", "Bloquear até liberação administrativa"]]} onChange={(selected) => onChange({ result_policy: selected as "blocked" | "released" })} />}
    </>
  );

  if (jornada) {
    return (
      <JornadaSettingsPanel
        icon={<SlidersHorizontal size={17} />}
        title="Configurações dos Simulados"
        titleAddon={(
          <>
            <span tabIndex={0} aria-describedby={id} aria-label="Como funcionam as configurações deste contexto" className="peer inline-flex items-center rounded-full p-1 text-slate-400 outline-none transition hover:text-orange-300 focus:text-orange-300">
              <Info size={16} />
            </span>
            {tooltip("left-0 top-full mt-2")}
          </>
        )}
        footer="O padrão da Coruja pode ser substituído por vínculo. Resultados já liberados permanecem disponíveis, mesmo se a política passar a bloqueada. A liberação inclui revisão e TopCoins elegíveis."
      >
        <div className={jornadaPanelGrid}>{fields}</div>
      </JornadaSettingsPanel>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="relative col-span-full">
        <span tabIndex={0} aria-describedby={id} aria-label="Como funcionam as configurações deste contexto" className="peer inline-flex items-center gap-2 text-sm font-semibold text-slate-400 outline-none focus:text-orange-300">
          <Info size={16} /> Configurações desta aplicação
        </span>
        {tooltip()}
      </div>
      {fields}
    </div>
  );
}
