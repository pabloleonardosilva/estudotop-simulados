export function sortByPtBrLabel<T>(items: readonly T[], getLabel: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => String(getLabel(a) ?? "").localeCompare(String(getLabel(b) ?? ""), "pt-BR", { sensitivity: "base", numeric: true }));
}

export function sortTextOptions<T extends { value: string; label: string; group?: string }>(items: readonly T[]): T[] {
  const placeholders = items.filter((item) => !item.value || item.value === "all" || item.value.startsWith("__"));
  const choices = items.filter((item) => !placeholders.includes(item));
  const groups = sortByPtBrLabel(Array.from(new Set(choices.map((item) => item.group || ""))), (group) => group);
  return [...placeholders, ...groups.flatMap((group) => sortByPtBrLabel(choices.filter((item) => (item.group || "") === group), (item) => item.label))];
}
