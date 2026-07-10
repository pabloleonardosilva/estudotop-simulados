# Sprint — Clone de Prova (Raio-X)

**Data inicial:** 2026-06-07  
**Revisão:** 2026-06-08  
**Módulo:** Raio-X de Provas  
**Status:** Implementado (fluxo revisado com painel de revisão)

---

## Objetivo

Permitir que o admin gere, a partir de um Raio-X já analisado, um **simulado clone em rascunho** com questões 100% originais criadas pela IA. O admin pode revisar, editar, substituir ou adicionar questões antes de aprovar a criação do simulado inteiro.

---

## Especificação Funcional

### Onde aparece

No final da tela `/admin/raio-x-provas/[id]` (modo `raiox`), após a seção "Relatório final do Raio-X".

### Fluxo do usuário

1. Admin visualiza o Raio-X finalizado de uma prova.
2. Vê a seção "Clone desta prova" no final da tela.
3. Clica em **"Criar clone desta prova"** → o título é **pré-preenchido** como `Simulado - Clone (Concurso) - Cargo - Ano`.
4. `CloneProvaModal` abre com opções:
   - **Título** (editável, pré-preenchido)
   - **Nível de similaridade** — 4 botões: Espelho (100%), Alta (75%), Média (50%), Livre (25%)
   - **Ajuste de dificuldade** — 5 botões: -2 a +2
5. Clica em **"Gerar clone"**.
6. `CloneProgressModal` com 5 etapas fake-animadas (sem salvar ainda).
7. Quando a API retorna as questões geradas: abre **`CloneReviewPanel`** (overlay full-screen).
8. Admin revisa no painel:
   - Vê todas as questões com preview do enunciado.
   - Pode **expandir** cada questão para editar enunciado, alternativas e assunto.
   - Pode **gerar variação IA** por questão → preview → aceitar ou descartar.
   - Pode **remover** questões.
   - Pode **adicionar questões** (manualmente ou com IA por assunto+dificuldade).
   - Pode **editar o título** do simulado.
9. Clica **"Aprovar simulado inteiro"** → `CloneProgressModal` de finalização (3 passos reais) → seção de sucesso com link.
10. Botão "Criar outro" reseta o estado para nova tentativa.

### O que a IA faz

- Mantém o **vocabulário técnico e estilo de redação** da banca original.
- Mantém os **assuntos cobrados**, mas os aborda de ângulo diferente.
- Mantém o **formato** (múltipla escolha vs. certo/errado) e o **número de alternativas**.
- Ajusta a **dificuldade** conforme solicitado.
- Se a questão original tinha imagem, descreve textualmente: `[IMAGEM: descrição detalhada]`.

### Output gerado (ao aprovar)

- N questões no banco com:
  - `status = "draft"`
  - `exam_board_id = Estudo TOP`
  - `source_origin = "exam_clone"`
  - `subject_id` — mapeado pelo assunto
- 1 simulado com `status = "draft"`, `scoring_model = "traditional"`, `navigation_type = "open"`, `feedback_mode = "final_only"`
- N registros em `simulado_questions`

---

## Implementação Técnica

### Arquivos novos

| Arquivo | Tipo | Descrição |
|---|---|---|
| `app/api/admin/exam-analyses/[id]/clone/route.ts` | API Route | Gera questões via OpenAI, não salva. Retorna JSON. `maxDuration=300` |
| `app/api/admin/exam-analyses/[id]/clone/finalize/route.ts` | API Route | Salva questões no banco e cria simulado. `maxDuration=120` |
| `app/api/admin/exam-analyses/[id]/clone/variation/route.ts` | API Route | Gera 1 variação sem salvar. `maxDuration=120` |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `app/admin/raio-x-provas/[id]/page-client.tsx` | Estado clone, `cloneProva()`, `CloneReviewPanel` (componente), `CloneProvaModal` (título auto-fill), `CloneProgressModal` (steps) |
| `docs/INDICE_FUNCOES_SISTEMA.md` | Seção 3.7.2 atualizada para o fluxo revisado |

### API Route — `POST /api/admin/exam-analyses/[id]/clone`

**Request body:**
```json
{
  "similarity_level": "75",
  "difficulty_adjustment": 0
}
```

**Response:**
```json
{
  "ok": true,
  "questions": [...],
  "exam_board_id": "uuid",
  "suggested_title": "Simulado - Clone (Concurso) - Cargo - Ano",
  "question_count": 20
}
```

**Sem salvar no banco.** Retorna as questões para revisão no frontend.

### API Route — `POST /api/admin/exam-analyses/[id]/clone/finalize`

**Request body:**
```json
{
  "simulado_title": "Título do simulado",
  "questions": [
    {
      "statement": "...",
      "question_type": "multiple_choice",
      "alternatives": [...],
      "subject_id": "uuid|null",
      "subject_ids": ["uuid"],
      "exam_board_id": "uuid",
      "year": 2025,
      "difficulty_level": 3,
      "explanation_text": "...|null",
      "module_name": "..."
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "simulado_id": "uuid",
  "simulado_title": "Título",
  "question_count": 20
}
```

**Etapas internas:** salva `questions` → salva `question_alternatives` → cria `simulado` → insere `simulado_questions`.

### API Route — `POST /api/admin/exam-analyses/[id]/clone/variation`

**Request body:**
```json
{
  "statement": "Enunciado da questão (vazio = gerar do zero)",
  "alternatives": [...],
  "module_name": "Redes",
  "difficulty_level": 3,
  "board_name": "CEBRASPE"
}
```

**Response:**
```json
{
  "ok": true,
  "question": { "statement": "...", "alternatives": [...], ... }
}
```

Se `statement` for vazio, gera questão nova do zero sobre `module_name`. Se preenchido, gera variação da questão de referência.

### Componentes (internos a `page-client.tsx`)

**`CloneProvaModal`** — Modal dark com:
- Input de título (pré-preenchido como `Simulado - Clone (Concurso) - Cargo - Ano`)
- 4 botões de similaridade (toggle)
- 5 botões de dificuldade (toggle)
- Botões "Cancelar" e "Gerar clone"

**`CloneProgressModal`** — Modal de loading dark com:
- 5 etapas fake-animadas (geração)
- Spinner violet
- Steps: "Analisando prova", "Gerando questões", "Aplicando estilo", "Preparando revisão", "Pronto"

**`CloneReviewPanel`** — Overlay full-screen, tema claro (`bg-slate-100`):
- Header: título editável + contador + "Fechar" + "Aprovar simulado"
- Lista de cards de questão (colapsados por padrão, expandem para editar)
- Por questão: preview enunciado, estrelas de dificuldade, botão "Variação IA", botão "Editar", botão "Remover"
- Expanded: `RichTextEditor` para enunciado, alternativas (textarea + radio de gabarito), `SubjectMultiSelect`
- Preview de variação IA: aceitar ou descartar
- Seção "Adicionar questão" no rodapé: tabs Manual / Com IA
- Overlay de finalização com 4 passos reais ao aprovar

**`type CloneReviewQuestion`** — Definido ao final de `page-client.tsx`:
```typescript
{
  tempId: string;
  statement: string;
  question_type: "multiple_choice" | "true_false";
  alternatives: { label: string; text: string; is_correct: boolean }[];
  subject_id: string | null;
  subject_ids: string[];
  exam_board_id: string;
  year: number;
  difficulty_level: number;
  explanation_text: string | null;
  module_name: string | null;
}
```

---

## Contexto de Design

- **Cor de destaque:** `violet` — diferencia do laranja (variações) e do azul (relatório).
- **Seção default:** card dark `bg-[#0C1E34]` com borda `border-violet-400/15`.
- **Seção sucesso:** gradiente dark `from-violet-500/[0.055]`.
- **Modais dark:** `bg-[#0C1E34]`, borda `border-white/[0.10]`, botão `from-violet-600 to-purple-500`.
- **`CloneReviewPanel`:** tema claro `bg-slate-100`, header branco com borda `border-slate-200`.

---

## Regras de Domínio

- Apenas questões com status diferente de `discarded` e `variation` são usadas como referência.
- **Nenhuma questão é salva no banco antes do "Aprovar simulado inteiro".**
- O simulado gerado é sempre `draft`.
- A banca de todas as questões geradas é sempre **Estudo TOP**.
- O mapeamento de subject é best-effort; questões sem match recebem `subject_id = null`.
- Questões com imagem na original recebem `[IMAGEM: ...]` no enunciado clone.
- A variação de questão não salva no banco — apenas substitui a questão na lista de revisão.

---

## Pendências / Melhorias Futuras

- [ ] Seleção individual de quais questões do Raio-X incluir no clone.
- [ ] Geração em lotes para provas grandes (>30 questões) com progresso real via streaming.
- [ ] Opção de gerar apenas variações de uma disciplina/assunto específico.
- [ ] Edição da explicação da resposta no `CloneReviewPanel`.
