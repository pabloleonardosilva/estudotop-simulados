export const HELP_CONTACT_REASONS = [
  { value: "system_usage_question", label: "Dúvida sobre utilização do sistema" },
  { value: "system_malfunction", label: "Informar mau funcionamento do sistema" },
  { value: "praise_or_suggestion", label: "Elogios e sugestões" },
] as const;

export type HelpContactReason = (typeof HELP_CONTACT_REASONS)[number]["value"];

const HELP_CONTACT_REASON_VALUES = new Set<string>(HELP_CONTACT_REASONS.map((item) => item.value));

export function isHelpContactReason(value: unknown): value is HelpContactReason {
  return typeof value === "string" && HELP_CONTACT_REASON_VALUES.has(value);
}

export function getHelpContactReasonLabel(value: string | null | undefined): string {
  return HELP_CONTACT_REASONS.find((item) => item.value === value)?.label || "Motivo não informado";
}
