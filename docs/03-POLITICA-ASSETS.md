# Política de Assets
## EstudoTOP Simulados

**Documento:** 03-POLITICA-ASSETS.md  
**Versão:** 2.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta política estabelece as normas oficiais para organização, armazenamento, utilização e manutenção dos assets do EstudoTOP Simulados.

São considerados assets:

- imagens;
- ícones;
- logotipos;
- banners;
- fundos;
- miniaturas;
- corujas;
- SVG;
- PNG;
- WebP;
- demais arquivos visuais utilizados pelo sistema.

Esta política existe para garantir organização, reutilização e padronização dos recursos visuais do projeto.

---

# 2. Princípios

Os assets fazem parte do patrimônio visual do EstudoTOP Simulados.

Todo asset deverá possuir:

- localização oficial;
- responsabilidade definida;
- nomenclatura consistente;
- organização por domínio funcional.

---

# 3. Diretório Oficial

## AST-001

A única estrutura oficial para assets utilizados em runtime é:

```text
public/
```

Todo recurso visual utilizado pelo sistema deverá estar localizado dentro dessa estrutura.

---

# 4. Estrutura Oficial

## AST-002

Os assets deverão ser organizados por domínio funcional.

Exemplo:

```text
public/

images/

logos/

icons/

jornadas/
    categories/
    page/
    premium/
    simulados/

resultados/

raio-x/
```

Novos diretórios deverão seguir exatamente esta filosofia.

---

# 5. Estruturas Proibidas

## AST-003

É proibido criar novos assets utilizados pelo sistema em:

```text
app/public/

imagens/

assets/

resources/

qualquer estrutura paralela
```

Caso estruturas antigas sejam encontradas deverão ser consolidadas na estrutura oficial.

---

# 6. Biblioteca de Criação

## AST-004

Arquivos utilizados apenas para produção gráfica não fazem parte do projeto.

Exemplos:

- PSD;
- arquivos Photoshop;
- arquivos Illustrator;
- renders;
- imagens em resolução máxima;
- versões alternativas;
- masters.

Esses arquivos deverão permanecer em biblioteca própria, fora da estrutura oficial do sistema.

---

# 7. Fonte Única

## AST-005

Cada asset deverá possuir apenas uma versão oficial.

Duplicações deverão ser evitadas.

Não deverão existir duas imagens diferentes representando exatamente o mesmo recurso.

---

# 8. Reutilização

## AST-006

Antes da criação de qualquer novo asset deverá ser verificado se já existe recurso equivalente.

Sempre que possível deverá ocorrer reutilização.

---

# 9. Organização

## AST-007

Os diretórios deverão refletir módulos do sistema.

Exemplos:

```
jornadas

simulados

resultados

raio-x

logos
```

Evitar diretórios genéricos como:

```
novas

teste

imagens2

diversos
```

---

# 10. Nomenclatura

## AST-008

Os arquivos deverão utilizar:

- letras minúsculas;
- hífen;
- nomes descritivos.

Exemplos:

```
header-bg.webp

logo-estudotop.svg

coruja-resultado.webp

miniatura-simulado.png
```

Nunca utilizar:

```
imagem nova.png

teste2.png

final-final.png

novo.webp
```

---

# 11. Formatos

## AST-009

Preferencialmente utilizar:

- SVG para elementos vetoriais;
- WebP para imagens comuns;
- PNG quando houver necessidade de transparência.

Evitar formatos maiores sem necessidade técnica.

---

# 12. Otimização

## AST-010

Os assets deverão possuir resolução compatível com sua utilização.

Não deverão ser utilizados arquivos excessivamente pesados quando houver alternativa equivalente.

---

# 13. Remoção

## AST-011

Antes da remoção de qualquer asset deverá ser realizada busca por:

- imports;
- URLs;
- referências em componentes;
- documentação;
- CSS;
- arquivos de configuração.

Nenhum asset deverá ser removido sem confirmação de que deixou de ser utilizado.

---

# 14. Auditorias

## AST-012

Periodicamente recomenda-se auditoria para localizar:

- assets duplicados;
- assets órfãos;
- assets não utilizados;
- assets fora da estrutura oficial;
- arquivos excessivamente grandes.

---

# 15. Alterações

## AST-013

Sempre que houver alteração relevante na estrutura de assets deverão ser atualizados:

- documentação;
- índice funcional quando aplicável;
- esta política, caso novas regras sejam criadas.

---

# 16. Relação com outras Políticas

Esta política complementa:

- Constituição Técnica;
- Política de Desenvolvimento;
- Política de Documentação.

Em caso de conflito prevalecerá a Constituição Técnica.

---

# 17. Histórico

## Versão 2.0

Esta versão consolida oficialmente as decisões tomadas durante a Sprint de Consolidação Arquitetural.

Principais decisões:

- `public/` passa a ser a única estrutura oficial de assets públicos;
- `app/public` passa a ser considerado legado e não deverá voltar a existir;
- assets deverão ser organizados por domínio funcional;
- criação da distinção entre assets oficiais e biblioteca de criação;
- oficialização da regra da Fonte Única para recursos visuais.