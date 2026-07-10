export type AlternativeLike = {
  id?: string;
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
  order_number?: number | null;
};

function normalizeToken(value?: string | null) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isCerto(alternative: AlternativeLike) {
  const label = normalizeToken(alternative.label);
  const text = normalizeToken(alternative.text);

  return label === "c" || label === "certo" || text === "certo";
}

function isErrado(alternative: AlternativeLike) {
  const label = normalizeToken(alternative.label);
  const text = normalizeToken(alternative.text);

  return label === "e" || label === "errado" || text === "errado";
}

function sortAlternatives<T extends AlternativeLike>(alternatives: T[]) {
  return [...alternatives].sort((a, b) => {
    const orderA = a.order_number ?? 0;
    const orderB = b.order_number ?? 0;
    return orderA - orderB;
  });
}

export function getStudentAlternatives<T extends AlternativeLike>(
  questionType: string | null | undefined,
  alternatives: T[],
): T[] {
  const sortedAlternatives = sortAlternatives(alternatives);

  if (questionType !== "true_false") {
    return sortedAlternatives;
  }

  const certo =
    sortedAlternatives.find(isCerto) ||
    sortedAlternatives.find((alternative) => alternative.order_number === 1) ||
    sortedAlternatives[0];

  const errado =
    sortedAlternatives.find(isErrado) ||
    sortedAlternatives.find((alternative) => alternative.order_number === 2) ||
    sortedAlternatives.find((alternative) => alternative !== certo) ||
    sortedAlternatives[1];

  return [
    {
      ...(certo || ({} as T)),
      label: "Certo",
      text: "Certo",
      order_number: 1,
      is_correct: Boolean(certo?.is_correct),
    } as T,
    {
      ...(errado || ({} as T)),
      label: "Errado",
      text: "Errado",
      order_number: 2,
      is_correct: Boolean(errado?.is_correct),
    } as T,
  ];
}

export function getStudentCorrectAlternative<T extends AlternativeLike>(
  questionType: string | null | undefined,
  alternatives: T[],
) {
  return getStudentAlternatives(questionType, alternatives).find(
    (alternative) => alternative.is_correct,
  );
}
