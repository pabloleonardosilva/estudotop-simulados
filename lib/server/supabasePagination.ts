import "server-only";

// PostgREST/Supabase corta silenciosamente qualquer resposta de .select()
// no limite padrão de linhas do projeto (max_rows, tipicamente 1000) — sem
// erro, sem aviso. Uma tabela como simulado_answers (tentativas × questões)
// ultrapassa isso facilmente em Eventos/Simulados grandes. Uma consulta
// truncada aqui não falha — ela silenciosamente "esquece" linhas reais, que
// o chamador então pode interpretar erroneamente como "não existe" (ex.:
// resposta ausente virando "em branco"). Incidente real documentado em
// docs/Sprint-resultados.md ("Incidente de truncamento silencioso").
//
// fetchAllPages() pagina de forma determinística (.order("id") — chave
// primária, garante que nenhuma linha seja pulada nem duplicada entre
// páginas) até a página voltar com menos que PAGE_SIZE linhas, e confere o
// total acumulado contra o `count` exato que o Postgres relata na mesma
// consulta — se algo ainda assim divergir (não deveria, mas é a rede de
// segurança pedida), lança erro em vez de seguir com dado incompleto. Não é
// "aumentar o limite": funciona para 100 linhas, 1.000, 20.000 ou qualquer
// volume futuro, porque sempre pagina até esgotar.
//
// Extraído de lib/server/simuladoQuestionReprocessing.ts (mesma implementação,
// verbatim) para ser reaproveitado por outros pontos do sistema que também
// precisam carregar tabelas potencialmente grandes sem risco de truncamento
// silencioso — nunca duplicado.
const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
  incompleteMessage: string = "Paginação incompleta: total esperado divergiu do total carregado. Consulta não aplicada com dado parcial — retry seguro.",
): Promise<T[]> {
  const rows: T[] = [];
  let expectedTotal: number | null = null;
  let from = 0;

  for (;;) {
    const { data, error, count } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (expectedTotal === null && typeof count === "number") expectedTotal = count;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (expectedTotal !== null && rows.length !== expectedTotal) {
    throw new Error(`${incompleteMessage} (esperava ${expectedTotal} linha(s), carregou ${rows.length}.)`);
  }

  return rows;
}
