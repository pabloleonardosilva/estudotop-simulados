# Sprint Integração Hotmart — Especificação Funcional, Técnica e Operacional

**Projeto:** EstudoTOP Simulados
**Módulo:** Integração Comercial Hotmart
**Status:** Especificação V1 aprovada funcionalmente — pronta para implementação por etapas
**Data:** 2026-08-28
**Escopo da V1:** venda, pela Hotmart, de acesso a **uma Jornada** ou **um Evento de Simulado** por produto Hotmart.

---

# 0. Autoridade documental e regra de implementação

Esta Sprint deve obedecer integralmente à governança técnica existente do EstudoTOP Simulados.

Antes de qualquer alteração, a implementação deve consultar e respeitar, nesta ordem:

1. `docs/00-CONSTITUICAO-TECNICA.md`;
2. `docs/04-POLITICA-DESENVOLVIMENTO.md`;
3. `docs/02-POLITICA-MIGRATIONS.md`;
4. `docs/05-POLITICA-DOCUMENTACAO.md`;
5. `docs/01-POLITICA-GIT.md`;
6. `docs/06-POLITICA-DEPLOY.md`;
7. `docs/07-CHECKLIST-SPRINT.md`;
8. `docs/08-CHECKLIST-DEPLOY.md`;
9. `docs/INDICE_FUNCOES_SISTEMA.md`;
10. `docs/Sprint-jornadas.md`;
11. `docs/Sprint-evento-de-simulado.md`;
12. documentação de segurança e auditoria aplicável.

Regra permanente:

> A integração Hotmart é uma camada comercial de origem de acesso. Ela não substitui o motor de Jornadas, o motor de Eventos, o motor de Simulados, o Supabase Auth nem os históricos pedagógicos existentes.

Toda alteração deve ser cirúrgica. Não realizar refatorações paralelas, mudanças visuais fora do módulo Hotmart, alterações não solicitadas em Jornadas/Eventos ou reorganizações arquiteturais não necessárias.

---

# 1. Princípio central

A Hotmart será a plataforma responsável pela operação comercial e pelos eventos financeiros da venda.

O EstudoTOP continuará responsável por:

- identidade do aluno;
- autenticação;
- criação/gestão de `students` e `profiles`;
- matrícula em Jornada;
- participação em Evento;
- validade de acesso;
- execução de Simulados;
- tentativas;
- respostas;
- resultados;
- histórico pedagógico;
- regras de liberação;
- bloqueio de acesso por status comercial;
- auditoria interna.

Fluxo conceitual:

```text
Produto Hotmart
      ↓
Webhook / API Hotmart
      ↓
EstudoTOP valida e identifica a transação
      ↓
Mapeamento Produto Hotmart → Destino EstudoTOP
      ↓
Aluno existente OU cadastro automático
      ↓
Jornada OU Evento
      ↓
Acesso normal pelo EstudoTOP
```

A Hotmart nunca será mecanismo de login no EstudoTOP.

---

# 2. Escopo comercial da V1

A V1 admite somente:

```text
1 Produto Hotmart = 1 Destino EstudoTOP
```

O destino pode ser:

- uma Jornada; ou
- um Evento de Simulado.

Não faz parte da V1:

- acesso global ao EstudoTOP;
- assinatura que libere toda a plataforma;
- combos com vários destinos;
- um produto Hotmart liberando várias Jornadas/Eventos;
- checkout próprio dentro do EstudoTOP;
- substituição da Hotmart como gateway financeiro;
- login com conta Hotmart;
- Hotmart Club como área de estudos.

---

# 3. Relação com os módulos existentes

## 3.1 Jornada

A compra Hotmart de uma Jornada deve reutilizar o fluxo oficial de matrícula existente.

Não criar uma segunda tabela de matrícula paralela.

A matrícula oficial continua sendo `student_jornadas` e o cronograma continua em `student_jornada_simulados`.

A compra apenas:

- identifica/cria o aluno;
- identifica a Jornada;
- cria ou atualiza a matrícula conforme as regras desta Sprint;
- registra a origem comercial e a transação.

Todas as regras normais da Jornada continuam válidas:

- `started_at`;
- `expires_at`;
- cronograma individual;
- liberação progressiva;
- status dos simulados;
- histórico;
- e-mails da Jornada;
- acesso apenas conforme status da matrícula.

## 3.2 Evento de Simulado

A compra Hotmart de um Evento deve reutilizar a participação oficial existente em `simulado_event_participants`.

Não criar participação paralela.

O aluno comprado pela Hotmart deve possuir exatamente o mesmo nível funcional de participação de um aluno incluído manualmente no Evento.

Se o Evento estiver `scheduled`, o aluno deve ser direcionado ao fluxo/tela de pré-evento já existente.

Se estiver `active` e ainda aceitar participantes, poderá ingressar normalmente.

Se estiver fechado/arquivado ou não aceitar novas participações, a compra entra em pendência administrativa.

## 3.3 Simulado

A Hotmart não concede acesso diretamente ao motor de Simulados na V1.

O acesso ao Simulado ocorre somente pelo contexto da Jornada ou do Evento adquirido.

Não alterar as regras de:

- tentativas;
- `attempt_context`;
- `event_id` / `event_participant_id`;
- resultados;
- TopCoins;
- anti-cheat;
- gabarito;
- dashboard do professor.

---

# 4. Identificação oficial do produto Hotmart

O vínculo não deve depender do nome textual do produto.

A documentação oficial da Hotmart Webhook 2.0 informa `product.ucode` como o código que deve ser usado pelo sistema integrado para identificar o produto.

Portanto:

> `product.ucode` será a chave externa principal do mapeamento Hotmart → EstudoTOP.

`product.id` e `product.name` também devem ser armazenados como metadados históricos, mas não serão a única autoridade de roteamento.

Nunca adivinhar o destino por similaridade de nomes.

---

# 5. Eventos Hotmart da V1

## 5.1 Eventos que concedem ou restauram acesso

Evento principal de concessão inicial:

```text
PURCHASE_APPROVED
```

`PURCHASE_COMPLETE` poderá ser armazenado e normalizado, mas a implementação deve confirmar pelo payload real/sandbox se ele deve ser tratado como confirmação adicional da mesma compra ou como transição específica. Não duplicar a concessão.

Regularizações posteriores devem ser processadas de forma idempotente, preservando o vínculo da compra e reativando somente quando o evento Hotmart efetivamente indicar situação financeira válida.

## 5.2 Eventos que bloqueiam acesso

Devem bloquear o produto afetado, e somente ele:

- `PURCHASE_DELAYED` → bloqueio temporário por inadimplência;
- `PURCHASE_REFUNDED` → bloqueio financeiro definitivo daquela compra;
- `PURCHASE_CHARGEBACK` → bloqueio financeiro definitivo daquela compra;
- `PURCHASE_CANCELED` → bloquear quando representar cancelamento de uma compra anteriormente válida;
- outros estados oficiais equivalentes confirmados durante a integração, desde que documentados antes de uso.

## 5.3 Eventos sem concessão de acesso

Não concedem matrícula/participação por si só:

- aguardando pagamento;
- boleto/ordem emitida;
- compra expirada;
- pedido de reembolso ainda não concluído;
- abandono de carrinho;
- eventos de Club;
- eventos não relacionados ao direito comercial da V1.

## 5.4 Pedido de reembolso

Pedido de reembolso não é igual a reembolso confirmado.

Regra:

```text
pedido de reembolso → registrar
reembolso confirmado → bloquear o acesso
```

---

# 6. Segurança do webhook

Endpoint sugerido:

```text
POST /api/webhooks/hotmart
```

O caminho final deve ser confirmado contra a estrutura real do projeto antes da criação.

Regras obrigatórias:

1. validar `X-HOTMART-HOTTOK` antes de processar o payload;
2. armazenar o segredo somente server-side;
3. nunca usar prefixo `NEXT_PUBLIC_` em segredo Hotmart;
4. rejeitar requisições sem credencial ou com credencial inválida;
5. validar versão/evento/estrutura mínima do payload;
6. validar `event.id` como identificador externo do webhook;
7. garantir idempotência por constraint de banco, não apenas por checagem em memória;
8. retornar resposta positiva rapidamente após persistência segura;
9. não expor stack, segredo ou payload sensível em respostas;
10. registrar tentativas inválidas em `security_event_logs` usando o helper central existente;
11. sanitizar logs;
12. nunca confiar em dados do frontend para conceder acesso Hotmart.

Variáveis privadas esperadas, sujeitas à confirmação técnica:

```text
HOTMART_HOTTOK
HOTMART_CLIENT_ID
HOTMART_CLIENT_SECRET
HOTMART_BASIC_TOKEN
HOTMART_ENVIRONMENT  # sandbox ou production; obrigatória e fail-closed
```

Não criar nomes redundantes se o projeto já possuir convenção para integrações externas.

A Hotmart usa OAuth 2.0 para APIs autenticadas. A função de obtenção/renovação do access token deve permanecer exclusivamente no servidor.

---

# 7. Idempotência

A Hotmart pode reenviar webhooks automaticamente e o administrador também pode reenviá-los manualmente pela própria Hotmart.

Regra central:

> O mesmo evento pode chegar várias vezes, mas deve produzir efeito funcional apenas uma vez.

A idempotência deve existir em três níveis:

## 7.1 Evento

`hotmart_webhook_events.external_event_id` deve ser único.

## 7.2 Transação

Uma mesma transação Hotmart não pode criar duas transações internas equivalentes.

## 7.3 Acesso

Uma mesma transação não pode:

- matricular duas vezes;
- inscrever duas vezes;
- estender duas vezes;
- enviar duas vezes o mesmo e-mail;
- executar duas vezes uma mesma decisão administrativa.

Reenvio de evento já processado deve:

- registrar `duplicate_delivery_count` ou histórico equivalente;
- atualizar `last_received_at`;
- não repetir efeitos de negócio.

---

# 8. Modelo de dados proposto

A implementação deve primeiro inspecionar o schema real do banco operacional e as migrations recentes. Os nomes abaixo são a especificação desejada; ajustes de nomes são aceitáveis apenas para aderir ao padrão já existente, sem alterar a semântica.

## 8.1 `hotmart_product_mappings`

Responsabilidade: mapear um produto Hotmart para exatamente uma Jornada ou um Evento.

Campos mínimos:

```text
id uuid PK
hotmart_product_ucode text NOT NULL UNIQUE
hotmart_product_id bigint NULL
hotmart_product_name text NOT NULL
hotmart_offer_name text NULL

destination_type text NOT NULL CHECK ('jornada','event')
jornada_id uuid NULL FK jornadas(id)
event_id uuid NULL FK simulado_events(id)

status text NOT NULL CHECK ('active','inactive','archived')
created_by uuid NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraint obrigatória:

> exatamente um entre `jornada_id` e `event_id` deve estar preenchido, coerente com `destination_type`.

Regras:

- `active`: novas compras são processadas;
- `inactive`: compra é registrada e vira pendência;
- `archived`: histórico preservado, não aceita processamento automático de novas compras;
- se já houver transação associada, não permitir DELETE físico;
- se nunca foi usado, DELETE pode ser permitido após confirmação administrativa;
- alteração do mapeamento afeta somente compras futuras e pendências ainda não resolvidas;
- compras já processadas guardam snapshot do destino efetivamente concedido.

## 8.2 `hotmart_transactions`

Responsabilidade: representar a compra/transação e seu estado comercial no EstudoTOP.

Campos mínimos:

```text
id uuid PK
transaction_code text NOT NULL UNIQUE
hotmart_product_ucode text NOT NULL
hotmart_product_id bigint NULL
product_name_snapshot text NOT NULL
offer_name_snapshot text NULL

student_id uuid NULL FK students(id)
mapping_id uuid NULL FK hotmart_product_mappings(id)
destination_type text NULL
jornada_id uuid NULL FK jornadas(id)
event_id uuid NULL FK simulado_events(id)

buyer_name text NULL
buyer_email text NOT NULL
buyer_document text NULL
buyer_document_type text NULL
buyer_phone text NULL

purchase_status text NOT NULL
purchase_approved_at timestamptz NULL
purchase_created_at timestamptz NULL
currency text NULL
amount numeric NULL
payment_type text NULL
installments integer NULL

processing_status text NOT NULL
processing_error_code text NULL
processing_error_message text NULL
processed_at timestamptz NULL

refund_status text NULL
refund_requested_at timestamptz NULL
refund_confirmed_at timestamptz NULL

created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

`processing_status` sugerido:

```text
received
processed
pending_mapping
pending_destination
pending_duplicate_purchase
pending_duplicate_student
pending_manual_refund
refund_requested
blocked_financial
processing_error
resolved
```

Não usar esses valores diretamente no frontend sem helper/labels centralizados.

A transação deve manter snapshot do produto/destino para preservar histórico mesmo se o mapeamento mudar no futuro.

## 8.3 `hotmart_webhook_events`

Responsabilidade: ledger idempotente de eventos recebidos.

Campos mínimos:

```text
id uuid PK
external_event_id text NOT NULL UNIQUE
transaction_code text NULL
hotmart_event text NOT NULL
hotmart_version text NULL
hotmart_creation_date timestamptz NULL
received_at timestamptz NOT NULL
last_received_at timestamptz NOT NULL
delivery_count integer NOT NULL DEFAULT 1
processing_status text NOT NULL
processed_at timestamptz NULL
error_code text NULL
error_message text NULL
payload_sanitized jsonb NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

O payload salvo deve ser minimizado/sanitizado. Não registrar dados de cartão, tokens, Authorization, cookies ou segredos.

## 8.4 `hotmart_access_links`

Responsabilidade: ligar uma transação Hotmart ao acesso real criado/reutilizado no EstudoTOP.

Campos mínimos:

```text
id uuid PK
hotmart_transaction_id uuid NOT NULL FK hotmart_transactions(id)
student_id uuid NOT NULL FK students(id)
destination_type text NOT NULL
student_jornada_id uuid NULL FK student_jornadas(id)
event_participant_id uuid NULL FK simulado_event_participants(id)
current_origin text NOT NULL CHECK ('hotmart','manual')
access_state text NOT NULL
access_started_at timestamptz NULL
access_expires_at timestamptz NULL
blocked_at timestamptz NULL
block_reason text NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraint: exatamente um entre `student_jornada_id` e `event_participant_id`.

Essa tabela não substitui a autoridade de acesso da Jornada/Evento. Ela registra o vínculo comercial e permite auditoria.

## 8.5 `hotmart_history`

Responsabilidade: histórico específico, permanente e legível das mudanças comerciais.

Campos mínimos:

```text
id uuid PK
student_id uuid NULL
transaction_id uuid NULL
mapping_id uuid NULL
access_link_id uuid NULL
actor_type text NOT NULL CHECK ('system','admin','hotmart')
actor_id uuid NULL
action text NOT NULL
previous_data jsonb NULL
new_data jsonb NULL
metadata jsonb NULL
created_at timestamptz NOT NULL
```

Eventos esperados incluem:

- compra aprovada;
- webhook duplicado;
- aluno criado;
- aluno existente encontrado;
- possível duplicidade de cadastro;
- compra duplicada;
- matrícula manual convertida em Hotmart;
- Jornada matriculada;
- Evento inscrito;
- extensão manual;
- extensão por compra duplicada;
- atraso financeiro;
- reativação financeira;
- reembolso solicitado;
- reembolso confirmado;
- chargeback;
- cancelamento administrativo;
- reativação administrativa;
- Hotmart → Manual;
- Manual → Hotmart por nova compra;
- mapeamento alterado;
- pendência criada/resolvida;
- merge de aluno;
- erro/reprocessamento.

Os logs genéricos existentes (`admin_audit_logs`, `security_event_logs`, `system_error_logs`, `student_activity_log`) continuam sendo usados onde aplicável. `hotmart_history` é histórico de domínio, não substituto do sistema de auditoria.

---

# 9. Alterações necessárias em matrículas existentes

## 9.1 `student_jornadas`

A tabela já possui status de matrícula.

Adicionar somente se o schema real ainda não possuir equivalentes:

```text
access_origin text NOT NULL DEFAULT 'manual'
commercial_block_reason text NULL
commercial_blocked_at timestamptz NULL
```

`access_origin` V1:

```text
manual | hotmart
```

Não alterar o significado de `students.origin_event_id`; ele representa origem cadastral, não origem comercial da matrícula.

Mapeamento recomendado de bloqueios:

- atraso Hotmart → `status = 'paused'`, `commercial_block_reason = 'hotmart_overdue'`;
- reembolso → `status = 'cancelled'`, razão `hotmart_refund`;
- chargeback → `status = 'cancelled'`, razão `hotmart_chargeback`;
- cancelamento administrativo → `status = 'cancelled'`, razão `admin_cancelled`;
- reativação após regularização → `status = 'active'`, limpar bloqueio financeiro;
- concessão manual após bloqueio financeiro definitivo → `status = 'active'`, `access_origin = 'manual'`, mantendo histórico Hotmart encerrado.

## 9.2 `simulado_event_participants`

A documentação atual registra que ainda não existe estado de participação cancelada com histórico preservado. A Hotmart exige essa capacidade.

Criar campos específicos, sem excluir/recriar participantes:

```text
access_status text NOT NULL DEFAULT 'active'
  CHECK ('active','paused','cancelled')
access_origin text NOT NULL DEFAULT 'manual'
  CHECK ('manual','hotmart')
commercial_block_reason text NULL
commercial_blocked_at timestamptz NULL
```

Regras:

- `active` → comportamento normal;
- `paused` → participação preservada, mas sem iniciar/retomar/abrir o recurso enquanto o bloqueio estiver vigente;
- `cancelled` → histórico preservado, sem acesso ao Evento comprado;
- nenhuma tentativa/resposta/resultado deve ser apagada por bloqueio comercial.

Todas as APIs de acesso do aluno ao Evento devem consultar o novo estado server-side.

O bloqueio deve ocorrer antes da entrega de qualquer conteúdo protegido do Evento.

---

# 10. Cadastro automático do aluno

## 10.1 Regra geral

Compra aprovada de produto mapeado deve localizar o aluno por e-mail normalizado.

Se existir:

- usar o mesmo `student`;
- não alterar senha;
- não criar outro Auth user;
- conceder somente o novo destino.

Se não existir:

- criar usuário no Supabase Auth;
- criar `profile`;
- criar `student` ativo conforme o fluxo aprovado para origem Hotmart;
- registrar origem cadastral adequada sem conflitar com `origin_event_id`;
- criar o acesso;
- gerar token seguro de primeiro acesso usando o mecanismo já existente;
- enviar e-mail para o aluno definir a própria senha.

Nunca gerar senha conhecida pelo admin, pela Hotmart ou persistida em texto.

## 10.2 Reutilização de código

Antes de criar qualquer helper novo, localizar e reutilizar a lógica compartilhável já existente em:

- criação administrativa de aluno;
- cadastro por Evento;
- primeiro acesso;
- `POST /api/auth/first-access`;
- templates de boas-vindas;
- validação de senha.

Se a lógica estiver duplicada, extrair somente o mínimo necessário para um helper server-side compartilhado, sem refatorar fluxos não relacionados.

---

# 11. Possível duplicidade de aluno por CPF/telefone

Se o e-mail Hotmart for diferente de um cadastro existente, mas CPF ou telefone coincidirem:

1. aceitar a compra;
2. criar o novo aluno com o e-mail Hotmart;
3. conceder o acesso normalmente ao novo cadastro;
4. criar uma pendência de possível duplicidade;
5. avisar o Admin;
6. nunca mesclar automaticamente.

Admin poderá escolher:

- **Manter os dois**;
- **Mesclar cadastros**.

Na mesclagem:

> o e-mail final deve ser o e-mail do cadastro Hotmart.

A mesclagem deve preservar:

- Auth válido;
- `profiles`;
- `students`;
- Jornadas;
- Eventos;
- tentativas contextualizadas;
- resultados;
- anotações;
- TopCoins;
- notificações;
- histórico de atividades;
- tickets/ajuda quando aplicável;
- compras Hotmart;
- demais FKs encontradas pela auditoria do código/schema.

A implementação do merge deve ocorrer em função server-side transacional/compensável e somente após mapear todas as FKs reais.

Se não for possível garantir merge seguro nesta primeira implementação, não improvisar: deixar a pendência aberta e impedir a ação até o mecanismo estar seguro. Porém, a V1 final só será aprovada após o fluxo de merge ser validado em ambiente de homologação.

---

# 12. E-mail como chave inicial, ID interno como vínculo permanente

O e-mail é usado para localizar o aluno no momento da compra.

Depois que a transação estiver associada:

> o vínculo permanente é `student_id`, não o e-mail.

Alterações posteriores de e-mail, CPF ou telefone no EstudoTOP:

- atualizam o cadastro atual;
- não reescrevem snapshots da transação;
- não quebram a associação histórica.

---

# 13. Compra de Jornada — regra normal

Compra aprovada + produto mapeado para Jornada válida:

1. validar Hotmart;
2. persistir evento idempotente;
3. criar/atualizar transação;
4. identificar/criar aluno;
5. localizar Jornada;
6. verificar matrícula existente;
7. criar matrícula quando não houver;
8. `started_at = data/hora da compra aprovada`;
9. calcular `expires_at` com a regra normal da Jornada;
10. gerar cronograma individual normal;
11. preservar todos os comportamentos de Jornada;
12. `access_origin = 'hotmart'`;
13. criar `hotmart_access_links`;
14. registrar histórico;
15. enviar e-mail correto.

A validade começa na data da compra aprovada, mesmo que o aluno só acesse depois.

Jornada sem simulados:

- matrícula é criada normalmente;
- prazo começa normalmente;
- aluno vê a Jornada;
- simulados futuros seguem o mecanismo normal de inclusão/liberação.

---

# 14. Compra de Evento — regra normal

Compra aprovada + produto mapeado para Evento válido:

1. identificar/criar aluno;
2. criar/reutilizar `simulado_event_participants`;
3. `access_origin = 'hotmart'`;
4. `access_status = 'active'`;
5. registrar transação e access link;
6. manter todas as regras normais do Evento.

Estados:

- `scheduled` → aluno vê pré-evento/aguarda início;
- `active` e aceitando participantes → acesso normal;
- encerrado/arquivado/não aceitando participantes → pendência, sem inscrição automática efetiva, conforme seção de destino indisponível.

---

# 15. Matrícula manual existente + nova compra Hotmart

Se o aluno já possui a mesma Jornada/Evento por origem manual e faz a primeira compra Hotmart daquele destino:

> reutilizar o mesmo vínculo de acesso; não criar matrícula/participação duplicada.

Alterações:

- `access_origin` passa de `manual` para `hotmart`;
- vincular a transação Hotmart;
- preservar progresso/histórico;
- redefinir o ciclo comercial a partir da nova compra.

Para Jornada:

```text
started_at = data da nova compra aprovada
expires_at = recalculado a partir dessa data
```

Cronograma futuro deve ser recalculado conforme as regras oficiais, sem apagar concluídos/liberados de forma incompatível com a regra atual da Jornada.

O histórico deve registrar explicitamente:

- matrícula manual existente;
- compra Hotmart;
- conversão de origem;
- data anterior;
- nova data inicial;
- expiração anterior;
- nova expiração.

---

# 16. Compra duplicada da mesma Jornada/Evento

Se o aluno já possui o destino por uma compra Hotmart válida e compra novamente o mesmo destino:

> não alterar automaticamente o acesso.

Criar pendência:

```text
pending_duplicate_purchase
```

Área administrativa:

```text
Configurações → Hotmart → Compras em duplicidade
```

Opções do Admin:

## 16.1 Estender acesso existente

Para Jornada ainda ativa:

- não criar nova matrícula;
- somar ao `expires_at` atual o período completo da Jornada adquirido novamente;
- não redefinir `started_at`;
- registrar transação adicional;
- registrar extensão no histórico.

Se a matrícula anterior já estiver expirada/cancelada financeiramente, tratar como novo ciclo comercial, não como extensão automática.

Para Evento, recompra do mesmo Evento não cria segunda participação. A decisão administrativa deve normalmente encaminhar para estorno, pois Evento não possui prazo extensível equivalente; qualquer exceção deve ser explícita e documentada.

## 16.2 Estornar/reembolsar a compra mais recente

Tentar via API Hotmart conforme seção de reembolso.

Se não for possível, direcionar o Admin para procedimento manual e manter pendência até confirmação por webhook.

---

# 17. Pagamento em atraso

Quando a Hotmart sinalizar atraso/inadimplência:

> bloquear imediatamente somente o recurso ligado àquela compra.

Jornada:

- `status = 'paused'`;
- razão `hotmart_overdue`;
- manter `started_at`;
- manter `expires_at`;
- cronograma continua correndo;
- dias de inadimplência não são devolvidos.

Evento:

- `access_status = 'paused'`;
- impedir acesso ao Evento enquanto bloqueado;
- preservar participação/histórico/tentativas.

Quando a Hotmart informar regularização válida:

- reativar automaticamente;
- não reiniciar prazo;
- não devolver dias;
- registrar histórico.

---

# 18. Reembolso, chargeback e cancelamento financeiro

Regra geral:

> O recurso comprado é bloqueado. O aluno não tem acesso a nada daquela Jornada/Evento originado pela compra afetada.

Nunca bloquear a conta inteira nem outros produtos válidos do mesmo aluno.

Nunca apagar:

- aluno;
- matrícula/participação;
- tentativas;
- respostas;
- resultados;
- TopCoins históricos já legitimamente gerados, salvo regra específica existente de reversão por exclusão de tentativa — não criar nova reversão nesta Sprint;
- histórico.

Jornada:

- `status = 'cancelled'`;
- registrar motivo específico.

Evento:

- `access_status = 'cancelled'`;
- impedir pré-evento, início, retomada e visualização futura do recurso comprado;
- preservar todos os registros internos.

Mesmo se o aluno já concluiu um Evento, um bloqueio financeiro do produto remove o direito de acesso àquele Evento/resultado como produto comprado. O histórico interno permanece.

---

# 19. Cancelamento e reativação administrativos

## 19.1 Cancelamento administrativo

Admin pode bloquear manualmente um acesso Hotmart sem alterar o estado financeiro da Hotmart.

Histórico deve diferenciar:

```text
admin_cancelled
```

de reembolso/chargeback/atraso.

## 19.2 Reativação de cancelamento administrativo

Permitida manualmente.

Origem continua Hotmart, desde que a compra Hotmart continue financeiramente válida.

## 19.3 Bloqueio financeiro Hotmart

Não permitir botão simples de “reativar compra”.

Se o Admin decidir devolver o acesso apesar de a compra estar financeiramente inválida:

> o acesso passa de origem Hotmart para origem Manual.

O vínculo/matrícula/participação pode ser reaproveitado, preservando histórico, mas:

- `access_origin = 'manual'`;
- compra Hotmart continua historicamente encerrada/bloqueada;
- registrar conversão Hotmart → Manual.

---

# 20. Nova compra após bloqueio financeiro anterior

Se o aluno fizer uma nova compra válida do mesmo destino depois de reembolso/chargeback/cancelamento anterior:

- nova transação independente;
- novo ciclo comercial;
- origem atual volta para Hotmart;
- histórico anterior permanece;
- para Jornada, novo `started_at` = nova compra e novo `expires_at`;
- para Evento ainda elegível, reativar/reutilizar participação conforme regra do Evento, sem apagar tentativas anteriores.

---

# 21. Produto sem mapeamento

Compra aprovada de produto não mapeado:

1. registrar webhook;
2. registrar transação;
3. identificar/criar aluno;
4. não conceder acesso;
5. `processing_status = pending_mapping`;
6. exibir em **Produtos não vinculados/Pendências**;
7. enviar e-mail neutro de processamento, não confirmação de acesso.

Admin poderá:

- vincular produto a Jornada;
- vincular produto a Evento;
- processar a compra;
- ou solicitar estorno.

Ao mapear:

> o novo vínculo passa a valer para compras futuras e o Admin escolhe explicitamente reprocessar pendências existentes.

---

# 22. Destino indisponível

Produto mapeado, mas destino não pode receber o acesso:

Exemplos:

- Jornada arquivada/inválida;
- Evento encerrado;
- Evento arquivado;
- Evento que não aceita novos participantes;
- registro de destino inconsistente.

Comportamento:

- não conceder acesso;
- manter compra válida registrada;
- criar `pending_destination`;
- informar motivo exato;
- permitir ao Admin:
  - regularizar destino e processar;
  - remapear a compra individualmente, quando comercialmente decidido;
  - solicitar estorno.

Nunca liberar outro produto automaticamente.

---

# 23. Mapeamento inativo ou arquivado

## Inativo

- webhook recebido;
- transação registrada;
- aluno pode ser criado;
- sem acesso;
- pendência administrativa;
- Admin pode reativar/remapear/estornar.

## Arquivado

- histórico preservado;
- não processa novas vendas automaticamente;
- não pode ser fisicamente excluído se já utilizado.

---

# 24. Alteração de mapeamento

Alterar Produto X de Jornada A para Jornada B:

> afeta apenas compras futuras e pendências explicitamente reprocessadas.

Compras já processadas conservam snapshot e acesso original.

Não migrar alunos automaticamente.

---

# 25. Proteção contra exclusão de destino

Se uma Jornada ou Evento possuir histórico Hotmart:

> bloquear exclusão física.

Permitir apenas estados de arquivamento/desativação previstos pelo módulo.

A validação deve existir server-side na rota de exclusão correspondente, além da UI.

A mensagem deve explicar que existe histórico comercial Hotmart relacionado.

---

# 26. Solicitação de reembolso via API Hotmart

A documentação oficial atual da Hotmart disponibiliza endpoint de reembolso de vendas:

```text
PUT /payments/api/v1/sales/:transaction_code/refund
```

com OAuth 2.0 / Bearer access token.

A implementação deve confirmar no momento do desenvolvimento a documentação oficial vigente e os critérios suportados.

Fluxo:

1. Admin escolhe **Estornar/Reembolsar**;
2. sistema valida transação;
3. obtém access token Hotmart server-side;
4. solicita o refund;
5. se a API aceitar, marcar **reembolso solicitado**, não confirmado;
6. aguardar `PURCHASE_REFUNDED` para confirmar;
7. se API não suportar a venda ou falhar de forma não recuperável, mostrar fallback manual;
8. pendência permanece aberta até confirmação financeira.

Nunca marcar `refunded` somente porque o botão foi clicado.

---

# 27. E-mails

A Hotmart cuida das comunicações financeiras.

O EstudoTOP cuida das comunicações de acesso educacional.

## 27.1 Aluno novo

E-mail deve informar:

- compra aprovada;
- produto adquirido;
- que a compra ocorreu via Hotmart;
- que a Hotmart processa a parte comercial;
- que o acesso ao produto ocorre **sempre pelo EstudoTOP Simulados**, não pela Hotmart;
- link seguro para definir senha;
- CTA de acesso;
- instruções específicas da Jornada/Evento.

## 27.2 Aluno existente

- informar novo acesso liberado;
- orientar login com credenciais habituais;
- não alterar senha.

## 27.3 Jornada

Reutilizar/adequar o fluxo de boas-vindas da Jornada para evitar e-mails redundantes.

## 27.4 Evento

E-mail deve informar Evento, data/hora, status e acesso. Se ainda não começou, explicar tela de espera/pré-evento.

## 27.5 Pendência

Nunca afirmar que acesso foi liberado.

Enviar mensagem neutra:

> recebemos a confirmação da sua compra e estamos concluindo a liberação do acesso.

E-mail não deve bloquear operação principal. Falha de e-mail gera log e possibilidade de reenvio.

---

# 28. Módulo administrativo

Rota/pasta exata deve seguir padrão atual de Configurações após inspeção do projeto.

Conceito:

```text
Configurações
└── Hotmart
```

Somente Admin.

Áreas:

## 28.1 Visão geral

- status da integração;
- webhooks recentes;
- compras aprovadas;
- acessos concedidos;
- bloqueios financeiros;
- pendências;
- duplicidades;
- erros recentes.

## 28.2 Produtos vinculados

Tabela/cards:

- produto Hotmart;
- `ucode`;
- ID;
- tipo de destino;
- Jornada/Evento;
- status;
- última alteração;
- ações.

## 28.3 Transações

Filtros:

- status financeiro;
- processamento;
- produto;
- Jornada/Evento;
- aluno;
- período;
- pendências.

Detalhe deve mostrar timeline completa.

## 28.4 Pendências

- produto sem mapeamento;
- mapeamento inativo;
- destino indisponível;
- erro técnico;
- reembolso manual pendente.

## 28.5 Compras em duplicidade

Mostrar matrícula/participação existente + nova compra.

Ações:

- estender quando aplicável;
- estornar;
- manter pendente.

## 28.6 Possíveis cadastros duplicados

Mostrar:

- cadastro Hotmart;
- cadastro existente;
- coincidência CPF/telefone;
- produtos/acessos de ambos;
- manter separados;
- mesclar.

## 28.7 Histórico / Logs

Timeline pesquisável de eventos Hotmart e decisões do Admin.

---

# 29. Permissões

V1:

> somente Admin.

Todas as páginas e APIs administrativas devem usar os guards oficiais (`requireAdmin`, `requireAdminPage` ou equivalentes existentes).

Não confiar em ocultação de menu.

Professor não acessa.

Aluno não acessa.

Webhook é público tecnicamente, porém autenticado pelo HOTTOK e protegido por validações server-side.

---

# 30. APIs sugeridas

Os caminhos devem ser adaptados ao padrão real após auditoria, mas a separação funcional deve existir.

```text
POST   /api/webhooks/hotmart

GET    /api/admin/hotmart/overview
GET    /api/admin/hotmart/mappings
POST   /api/admin/hotmart/mappings
PATCH  /api/admin/hotmart/mappings/[id]
DELETE /api/admin/hotmart/mappings/[id]          # somente se nunca usado

GET    /api/admin/hotmart/transactions
GET    /api/admin/hotmart/transactions/[id]
POST   /api/admin/hotmart/transactions/[id]/reprocess
POST   /api/admin/hotmart/transactions/[id]/refund

GET    /api/admin/hotmart/pending
POST   /api/admin/hotmart/pending/[id]/resolve

GET    /api/admin/hotmart/duplicates/purchases
POST   /api/admin/hotmart/duplicates/purchases/[id]/extend
POST   /api/admin/hotmart/duplicates/purchases/[id]/refund

GET    /api/admin/hotmart/duplicates/students
POST   /api/admin/hotmart/duplicates/students/[id]/keep-separate
POST   /api/admin/hotmart/duplicates/students/[id]/merge

GET    /api/admin/hotmart/history
```

Evitar criar endpoint quando a operação puder ser incorporada com clareza a um endpoint já existente. Não criar CRUD excessivo sem necessidade.

---

# 31. Camada server-side sugerida

Criar um domínio isolado, por exemplo:

```text
app/lib/server/hotmart/
  client.ts
  types.ts
  webhook.ts
  normalize.ts
  processor.ts
  access.ts
  refund.ts
  history.ts
```

ou o padrão equivalente já usado pelo projeto.

Responsabilidades:

- `client`: OAuth e chamadas API Hotmart;
- `types`: payloads mínimos tipados;
- `webhook`: autenticação/parse;
- `normalize`: normaliza eventos Hotmart em eventos internos;
- `processor`: orquestra idempotência e estado;
- `access`: concessão/bloqueio/reconciliação de Jornada/Evento;
- `refund`: solicitação de reembolso;
- `history`: histórico de domínio.

Não colocar toda a integração dentro do Route Handler.

---

# 32. Concorrência e consistência

Operações críticas devem ser resistentes a concorrência.

Casos:

- dois webhooks iguais simultâneos;
- `PURCHASE_APPROVED` chegando enquanto Admin reprocessa;
- duas compras do mesmo aluno/produto em segundos;
- refund chegando enquanto acesso está sendo estendido;
- merge de aluno enquanto novo webhook chega.

Proteções:

- constraints UNIQUE;
- transações/RPCs PostgreSQL onde a atomicidade for indispensável;
- updates condicionais;
- locks/advisory lock somente se necessário e documentado;
- operações compensáveis para Supabase Auth + banco, já que Auth e PostgreSQL não formam uma transação única.

Nunca depender apenas de estado React para consistência.

---

# 33. Histórico e auditoria

Toda mudança relevante deve existir no `hotmart_history` e, quando aplicável, também nos logs oficiais.

Exigência aprovada:

> O histórico deve registrar todos os eventos: compras duplicadas, inserção manual + compra, conversões, extensões, bloqueios, reativações, merges, estornos e decisões administrativas.

Nunca sobrescrever silenciosamente o passado.

Dados sensíveis em metadata devem ser sanitizados.

---

# 34. LGPD e minimização

Guardar apenas o necessário para:

- identificar comprador;
- reconciliar transação;
- conceder/bloquear acesso;
- suporte;
- auditoria;
- prevenção de fraude.

Não armazenar:

- cartão completo;
- CVV;
- tokens Hotmart em tabelas;
- Authorization;
- cookies;
- payloads brutos desnecessários.

Snapshots de e-mail/CPF/telefone da compra são históricos comerciais e não devem ser sobrescritos por alterações posteriores do cadastro.

---

# 35. Alterações de acesso manual

Admin continua soberano sobre o acesso interno.

## Matrícula Hotmart + adicionar dias manualmente

Permitido.

- origem continua Hotmart;
- registrar quem adicionou;
- valor anterior;
- valor novo;
- motivo, se informado.

## Tentar inserir manualmente aluno que já possui acesso Hotmart

Não criar duplicado.

Avisar que o acesso já existe por Hotmart e oferecer somente ações administrativas compatíveis.

---

# 36. Compra de vários produtos

Um aluno pode possuir simultaneamente várias Jornadas e Eventos.

Cada transação é independente.

Bloqueio de Produto A nunca bloqueia Produto B.

A conta do aluno permanece única.

---

# 37. Produto descontinuado

Mapeamento com histórico:

- não excluir;
- arquivar/desativar;
- manter histórico.

Mapeamento nunca utilizado:

- exclusão física pode ser permitida mediante confirmação.

---

# 38. Alteração posterior de dados do aluno

Telefone/CPF/e-mail podem mudar no cadastro.

A transação preserva o snapshot original.

Compras já processadas continuam vinculadas por `student_id`.

---

# 39. Estados visuais e labels

Não espalhar strings de status pela interface.

Criar helpers centralizados para:

- status Hotmart;
- status de processamento;
- status de mapeamento;
- status de acesso;
- severidade da pendência.

A interface deve distinguir claramente:

- financeiro válido;
- atraso temporário;
- reembolso;
- chargeback;
- pendência técnica;
- pendência administrativa;
- acesso manual;
- acesso Hotmart.

---

# 40. Compatibilidade com a navegação do aluno

A integração não deve criar menu Hotmart para o aluno.

Depois da compra:

- Jornada aparece nos fluxos normais de Jornada;
- Evento aparece nos fluxos normais de Evento;
- regras de navegação existentes continuam sendo a autoridade.

Bloqueios comerciais devem refletir-se nos endpoints server-side de acesso, não apenas nos cards.

---

# 41. Ordem oficial de implementação

## Etapa 0 — Auditoria antes de código

- consultar Índice;
- localizar páginas/APIs/helpers reais de Jornada;
- localizar criação de aluno/first access;
- localizar participação de Evento;
- consultar schema/migrations atuais;
- mapear todas as FKs de `students`, `profiles`, `student_jornadas`, `simulado_event_participants` antes do merge;
- documentar arquivos que serão impactados.

**Não alterar código nesta etapa.**

## Etapa 1 — Migration estrutural Hotmart

Criar migration oficial em `supabase/migrations/` com:

- tabelas Hotmart;
- constraints;
- índices;
- RLS;
- revoke de `anon/authenticated` quando todo acesso for server-side;
- colunas mínimas de origem/bloqueio em Jornada/Evento;
- sem execução automática.

Validar SQL antes de seguir.

## Etapa 2 — Domínio server-side e testes puros

Criar tipos, normalização, autenticação HOTTOK e helpers de status.

Testar payloads simulados sem alterar acessos reais.

## Etapa 3 — Ledger de webhook idempotente

Implementar endpoint e persistência de eventos.

Primeiro objetivo:

> receber, validar, registrar e deduplicar — sem conceder acesso ainda.

Testar reenvio 2x/5x.

## Etapa 4 — Mapeamentos Hotmart

Criar APIs Admin + interface de Produtos vinculados.

Testar:

- Jornada;
- Evento;
- ativo/inativo;
- alteração;
- arquivamento;
- proteção de exclusão.

## Etapa 5 — Transações + pendências

Persistir transação normalizada e criar painel.

Ainda sem criar acesso automático até os testes passarem.

## Etapa 6 — Cadastro automático de aluno

Reutilizar Auth/first access.

Testar aluno novo e existente.

## Etapa 7 — Concessão de Jornada

Integrar `PURCHASE_APPROVED` com matrícula oficial.

Testar Jornada com/sem simulados.

## Etapa 8 — Concessão de Evento

Implementar `access_status/access_origin` e integração com participante oficial.

Testar scheduled/active/closed.

## Etapa 9 — Bloqueios financeiros

Implementar delayed/refund/chargeback/cancelled.

Garantir bloqueio server-side e isolamento por produto.

## Etapa 10 — Duplicidade de compra

Criar pendência, modal, extensão/estorno.

## Etapa 11 — Duplicidade de aluno e merge

Implementar detecção e merge auditado.

## Etapa 12 — Refund API

Implementar OAuth Hotmart + endpoint de solicitação de refund + fallback manual.

## Etapa 13 — E-mails

Aluno novo, existente e pendência.

## Etapa 14 — Histórico completo

Garantir timelines e integração com audit logger.

## Etapa 15 — Proteções de exclusão

Jornada/Evento com histórico Hotmart não podem ser apagados fisicamente.

## Etapa 16 — Homologação completa

Executar matriz de testes da seção 43.

## Etapa 17 — Documentação e índice

Atualizar este documento, Índice e status conforme implementação real.

## Etapa 18 — Build e encerramento

- `npx tsc --noEmit`;
- `npm run build`;
- lint conforme política vigente;
- checklist Sprint;
- relatório;
- aguardar autorização para commit;
- nunca executar push/deploy/migration sem autorização.

---

# 42. Testes técnicos mínimos por etapa

Cada etapa deve terminar com teste local antes de começar a seguinte.

Obrigatórios:

- unidade/helper: normalização de evento;
- validação HOTTOK inválido;
- payload inválido;
- event.id duplicado;
- transaction_code duplicado;
- mapping inexistente;
- mapping inativo;
- mapping arquivado;
- Jornada inexistente;
- Evento inexistente;
- aluno existente;
- aluno novo;
- mesmo CPF/e-mail diferente;
- mesmo telefone/e-mail diferente;
- compra duplicada;
- atraso;
- regularização;
- refund;
- chargeback;
- admin cancel;
- admin reactivate;
- Hotmart → Manual;
- nova compra → Hotmart;
- vários produtos independentes;
- e-mails sem duplicação;
- reprocessamento idempotente.

---

# 43. Matriz oficial de homologação V1

A V1 somente é aprovada após validar, no mínimo:

1. compra aprovada de aluno novo;
2. criação Supabase Auth segura;
3. definição de senha pelo primeiro acesso;
4. e-mail explicando acesso pelo EstudoTOP;
5. compra aprovada de aluno existente;
6. compra de Jornada;
7. Jornada sem simulados;
8. compra de Evento agendado;
9. tela de pré-evento;
10. compra de Evento ativo;
11. Evento encerrado → pendência;
12. produto sem mapeamento → cadastro sem acesso;
13. mapeamento inativo → pendência;
14. destino arquivado → pendência;
15. reprocessamento após corrigir mapeamento;
16. matrícula manual + compra → mesma matrícula, origem Hotmart e prazo reiniciado na compra;
17. compra duplicada → nenhuma alteração automática;
18. compra duplicada → extensão da Jornada;
19. compra duplicada → refund;
20. atraso financeiro → bloqueio apenas daquele produto;
21. prazo continua correndo durante atraso;
22. regularização → reativação sem devolver dias;
23. refund → bloqueio do produto;
24. chargeback → bloqueio do produto;
25. histórico pedagógico preservado;
26. resultado de Evento bloqueado comercialmente não acessível;
27. outro produto do mesmo aluno continua acessível;
28. cancelamento administrativo;
29. reativação administrativa de cancelamento administrativo;
30. bloqueio Hotmart não permite simples reativação Hotmart;
31. conversão Hotmart → Manual pelo Admin;
32. nova compra depois → origem volta a Hotmart;
33. adição manual de dias registrada;
34. possível duplicidade por CPF;
35. possível duplicidade por telefone;
36. manter dois cadastros;
37. mesclar, preservando e-mail Hotmart;
38. merge preserva Jornadas/Eventos/tentativas/resultados/TopCoins/anotações;
39. alteração do mapping não afeta compras antigas;
40. produto arquivado mantém histórico;
41. exclusão de mapping usado é bloqueada;
42. exclusão de Jornada/Evento com histórico Hotmart é bloqueada;
43. webhook reenviado não duplica efeito;
44. webhook reenviado 5 vezes continua idempotente;
45. refund via API Hotmart em sandbox/teste;
46. falha de refund → fallback manual;
47. confirmação de refund somente após webhook/estado confirmado;
48. acesso Admin-only;
49. Professor sem acesso;
50. aluno sem acesso ao painel Hotmart;
51. HOTTOK inválido bloqueado e auditado;
52. segredo não aparece em client bundle/logs;
53. payload sanitizado;
54. TypeScript aprovado;
55. build aprovado;
56. regressão de Jornada normal inexistente;
57. regressão de Evento manual inexistente;
58. regressão de Simulado avulso inexistente.

---

# 44. Critérios de pronto

A Sprint Hotmart V1 somente estará pronta quando:

- produto Hotmart puder ser vinculado a uma Jornada ou Evento;
- webhook 2.0 estiver autenticado e idempotente;
- compra aprovada criar/localizar aluno;
- aluno novo definir a própria senha;
- Jornada/Evento correto for concedido;
- produto não mapeado nunca gerar acesso indevido;
- bloqueios financeiros funcionarem por produto;
- atraso for temporário sem congelar prazo;
- refund/chargeback preservarem histórico;
- duplicidade de compra exigir decisão administrativa;
- duplicidade de aluno puder ser analisada/mesclada com segurança;
- histórico completo estiver disponível;
- refund API possuir tentativa automática + fallback manual;
- Jornada/Evento com histórico Hotmart não puder ser excluído fisicamente;
- todas as APIs administrativas estiverem protegidas;
- documentação e índice estiverem sincronizados;
- TypeScript e build estiverem limpos;
- nenhuma migration tiver sido executada sem autorização;
- nenhum commit/push/deploy tiver sido feito sem autorização.

---

# 45. Referências externas oficiais da Hotmart

Consultar novamente no momento da implementação, pois APIs externas podem evoluir.

- Webhook de eventos de pedido 2.0.0: `https://developers.hotmart.com/docs/pt-BR/2.0.0/webhook/purchase-webhook/`
- Autenticação de aplicativo OAuth 2.0: `https://developers.hotmart.com/docs/pt-BR/start/app-auth/`
- Reembolso de vendas: `https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-refund/`

Pontos confirmados em 2026-08-28:

- `X-HOTMART-HOTTOK` deve ser validado;
- Webhook 2.0 possui `event.id` único;
- `product.ucode` é indicado pela Hotmart para identificação do produto no sistema integrado;
- API Hotmart usa OAuth 2.0;
- há endpoint oficial de solicitação de refund por `transaction_code`.

---

# 46. Observação final

A Hotmart deve permanecer desacoplada da lógica pedagógica.

Regra de arquitetura final:

```text
Hotmart informa o estado comercial.
EstudoTOP decide e aplica o estado de acesso.
Jornada e Evento continuam sendo os motores oficiais do produto educacional.
Histórico nunca é apagado para esconder eventos anteriores.
```

---

# 47. Estado de implementação em 2026-08-28

Implementado nesta entrega:

- migration estrutural `20260828110000_create_hotmart_integration.sql`, **APLICADA manualmente no Supabase pelo responsável antes da validação de 2026-08-30**; não foi reexecutada nem revertida pelo agente;
- tabelas `hotmart_product_mappings`, `hotmart_transactions`, `hotmart_webhook_events`, `hotmart_access_links` e `hotmart_history`;
- estados comerciais preservando `student_jornadas` e `simulado_event_participants` como autoridades de acesso;
- webhook `POST /api/webhooks/hotmart`, com HOTTOK, normalização, payload minimizado, ledger idempotente por constraint/RPC e processamento isolado por produto;
- concessão inicial de Jornada ou Evento, conversão de acesso manual e detecção de compra Hotmart duplicada;
- bloqueio de Jornada/Evento por atraso, refund, chargeback ou cancelamento financeiro, sem alterar o status global do aluno;
- bloqueio server-side de participante de Evento pausado/cancelado nas rotas de listagem, detalhe, heartbeat, conteúdo, tentativa e resultado;
- área administrativa `/admin/configuracoes/hotmart` e APIs de mappings, transações e histórico;
- solicitação server-side de refund, mantendo `requested` diferente de `confirmed`.

Permanecem parciais ou bloqueados até ambiente com migration aplicada e fixtures controladas:

- merge de possíveis alunos duplicados: a tela informa a pendência, mas não oferece ação enquanto todas as FKs não puderem ser validadas transacionalmente;
- resolução administrativa completa de compra duplicada (extensão idempotente e refund pela própria aba);
- reprocessamento manual de pendências;
- e-mails Hotmart específicos e controle de envio por transação;
- testes funcionais da matriz que dependem das novas tabelas, credenciais sandbox e banco de homologação.

Validação estrutural remota de 2026-08-30:

- PostgREST OpenAPI confirmou as cinco tabelas, todas as colunas previstas, os campos adicionados em `student_jornadas` e `simulado_event_participants` e a RPC `register_hotmart_webhook_event`;
- consultas com chave anônima às cinco tabelas retornaram HTTP 401, confirmando ausência de leitura para `anon`;
- consultas somente leitura com service role confirmaram a permanência de 3 Jornadas, 2 Eventos, 20 alunos, 19 matrículas e 3 participantes;
- a inspeção exata de `pg_constraint`, `pg_indexes`, `pg_policies` e ACLs permaneceu bloqueada porque o ambiente não possui conexão SQL/CLI nem navegador autenticado conectado. Nenhuma divergência foi encontrada nas superfícies disponíveis, mas constraints, índices, policies e grants exatos ainda exigem consulta direta ao catálogo antes da continuação da Sprint.

Variáveis privadas esperadas, sem valores versionados:

```text
HOTMART_HOTTOK
HOTMART_CLIENT_ID
HOTMART_CLIENT_SECRET
```

---

# 48. Etapa 2 — conclusão interna em 2026-08-30

`20260828110000_create_hotmart_integration.sql` permanece **APLICADA MANUALMENTE E VALIDADA**. Ela não foi alterada, reexecutada ou revertida nesta etapa. A conferência somente leitura preservou 3 Jornadas, 2 Eventos, 20 alunos, 19 matrículas e 3 participantes; as cinco tabelas Hotmart ficaram novamente vazias após a remoção do único evento técnico criado para validar a RPC.

Foram concluídos em código: reprocessamento administrativo sem recriar aluno já vinculado; regularização de atraso sem mudar datas; conversões Manual → Hotmart e Hotmart → Manual preservando progresso; cancelamento/reativação administrativa; adição de dias auditada; alteração de mapping sem mover acessos já concedidos; refund na interface; e-mails específicos com claim persistente; e bloqueio comercial nas rotas de execução, retomada, submit e resultado de Jornada/Evento.

Foi criada, mas **NÃO EXECUTADA**, a migration complementar `20260830120000_complete_hotmart_admin_workflows.sql`. Ela adiciona estado persistente para tentativas/resolução de pendências e a RPC concorrente `extend_hotmart_duplicate_jornada`. A RPC bloqueia a transação e a matrícula, registra a aplicação e garante que a mesma compra estenda uma Jornada no máximo uma vez. Enquanto essa migration não for autorizada/aplicada, a API principal usa fallback compatível e as ações que dependem dela retornam bloqueio explícito.

O merge de alunos permanece formalmente bloqueado. A identidade de `students` coincide com `auth.users`, enquanto tentativas, resultados, feedbacks e TopCoins referenciam `auth.users`; matrículas, Eventos, ajuda, atividade, notificações, vídeos e tabelas Hotmart referenciam `students`. Existem conflitos possíveis de unicidade por Jornada, Evento, tentativa, feedback e ganhos. Um merge seguro exige uma RPC transacional específica, política explícita de consolidação para cada unique e coordenação com Supabase Auth. Nenhum DELETE/update parcial foi implementado.

Validações internas: testes unitários Hotmart PASS; `npx tsc --noEmit` PASS; `npm run build` PASS; lint dos arquivos em escopo PASS; `git diff --check` PASS. OAuth, sandbox/webhook real, refund real e reconciliação externa permanecem NÃO EXECUTADOS por dependerem da configuração Hotmart. Os cenários funcionais que exigem a migration complementar também permanecem NÃO EXECUTADOS; não foram classificados como PASS por inspeção.

## 48.1 Correção pós-auditoria da migration complementar

Em 2026-08-30, `20260830120000_complete_hotmart_admin_workflows.sql` foi corrigida após auditoria e continua **NÃO EXECUTADA**, aguardando nova auditoria. A versão corrigida valida matrícula ativa, vigente, regular e Hotmart; valida Admin ativo dentro das RPCs; incrementa reprocessamentos atomicamente; torna “manter separados” transacional e idempotente; restringe os tipos de resolução aos fluxos usados; e separa claim, lease, tentativas e confirmação dos e-mails. Claims abandonados podem ser retomados após 15 minutos e o envio usa chave idempotente estável do Resend.

## 48.2 Correção final dos bloqueadores de e-mail e refund

A migration complementar foi corrigida novamente em 2026-08-30 e permanece **NÃO EXECUTADA**, aguardando nova auditoria. Claims abandonados agora possuem recuperação administrativa em lote controlado, com no máximo cinco tentativas por tipo de e-mail. O primeiro acesso usa token HMAC determinístico por transação/aluno; somente o hash continua persistido, retries reutilizam o mesmo link e a validade de 72 horas é renovada apenas se o token ainda não tiver sido usado.

## 48.3 Últimos bloqueadores de idempotência

Em 2026-08-30, os dois bloqueadores restantes foram corrigidos somente nos consumidores. A identidade da entrega de primeiro acesso passa a ser determinada pelo token Hotmart determinístico já existente antes de consultar o estado atual de senha; token usado reconcilia `sent_at` local sem novo Resend, e token ainda não usado preserva link, conteúdo e idempotency key. Eventos financeiros repetidos agora só registram histórico quando alteram efetivamente estado e motivo do acesso; um novo `PURCHASE_REFUNDED` para transação já confirmada permanece no ledger técnico, mas é no-op funcional e preserva o primeiro `refund_confirmed_at`. A migration complementar não foi alterada nem executada e aguarda nova auditoria.

## 48.4 Fail-closed da entrega de primeiro acesso

A leitura de `student_registration_confirmations` agora distingue registro ausente de falha da consulta. Erro de banco interrompe o envio, libera o claim pelo mecanismo oficial com falha sanitizada e permite retry posterior; nunca cai no payload de login. A consulta do perfil ocorre somente após ausência confirmada da entrega, e token já usado é reconciliado localmente antes de exigir `RESEND_API_KEY`. A migration complementar permanece não alterada e não executada, aguardando auditoria final.

## 48.5 Homologação funcional interna com banco real

Em 2026-08-30, a migration complementar `20260830120000_complete_hotmart_admin_workflows.sql` foi confirmada como **APLICADA E ESTRUTURALMENTE VALIDADA** no Supabase. Ela não foi reexecutada, revertida ou corrigida durante a homologação.

A homologação funcional interna executou 35 cenários controlados no banco real, com **35/35 PASS**. Foram validados incremento atômico de tentativas, claims e leases de e-mail, conclusão e retry, resolução idempotente de duplicidade, extensão de Jornada inclusive sob concorrência real, todas as recusas de elegibilidade, fluxo interno de solicitação de reembolso, constraints, ACL funcional para `anon` e `authenticated`, unicidade de vínculo, independência entre produtos e bloqueio comercial de participante de Evento.

As fixtures usaram prefixo exclusivo, foram removidas ao final e o baseline permaneceu em 3 Jornadas, 2 Eventos, 20 alunos, 19 matrículas e 3 participantes. Nenhum cadastro real foi usado como fixture ou alterado, nenhuma credencial foi exibida e nenhum e-mail real foi enviado.

O escopo interno está **CONCLUÍDO INTERNAMENTE**. Permanecem pendentes apenas os testes externos que exigem credenciais ou ambiente Hotmart/Resend: OAuth, webhook real ou sandbox, solicitação de refund real ou sandbox, entrega real de e-mail e reconciliação com serviços externos.

## 49. Preparação da homologação externa controlada

Em 2026-08-30, a documentação oficial Hotmart vigente foi confrontada com a integração antes de qualquer chamada autenticada. O Webhook de pedidos 2.0.0 usa `X-HOTMART-HOTTOK`, `id`, `event`, `data`, `data.product.ucode` e timestamps Unix em milissegundos. Os eventos documentados incluem `PURCHASE_APPROVED`, `PURCHASE_COMPLETE`, `PURCHASE_DELAYED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`, `PURCHASE_CANCELED` e `PURCHASE_EXPIRED`. OAuth usa client credentials com Client ID, Client Secret e credencial Basic; o token bearer possui `expires_in`. Refund usa `PUT /payments/api/v1/sales/:transaction_code/refund`; HTTP 200 aceita a solicitação, mas não confirma financeiramente o reembolso.

### Homologação interna

Permanece concluída com 35/35 PASS e baseline preservado.

### Homologação externa

Estado: **PARCIAL — INTERROMPIDA NO READINESS**. `HOTMART_HOTTOK`, `HOTMART_CLIENT_ID` e `HOTMART_CLIENT_SECRET` estão ausentes no ambiente local. Resend, `REGISTRATION_TOKEN_SECRET` e `NEXT_PUBLIC_APP_URL` estão configurados. A URL pública configurada é `https://simulados.estudotop.com.br/api/webhooks/hotmart`, mas um POST controlado sem HOTTOK retornou 404, demonstrando que a implementação atual ainda não está publicamente acessível nesse ambiente. Nenhum evento, aluno, acesso ou e-mail foi criado.

A revisão encontrou três incompatibilidades que precisam de decisão e correção explícita antes da homologação autenticada: o normalizador não converte os timestamps numéricos em milissegundos do Webhook 2.0.0; a obtenção OAuth não envia a credencial Basic indicada pela documentação oficial; e o cliente de refund está fixo no endpoint de produção, sem seleção inequívoca de sandbox. Nenhuma delas foi corrigida silenciosamente nesta etapa.

Pré-requisitos para continuar: deploy autorizado do código atual em ambiente de preview/homologação, credenciais Hotmart do mesmo ambiente, HOTTOK correspondente, produto e `product.ucode` de teste, mapping de homologação, conta de e-mail controlada e correção/revalidação das incompatibilidades acima. Nenhum refund, OAuth, webhook autenticado ou envio Resend real foi executado.

## 50. Correção dos bloqueadores de readiness externo

Em 2026-08-30, os três bloqueadores locais foram corrigidos sem chamadas externas. O normalizador passou a tratar explicitamente valores numéricos Hotmart como Unix Epoch em milissegundos e preservou suporte a strings ISO; isso se aplica a `creation_date`, `purchase.approved_date` e `purchase.order_date`. A data inicial comercial continua derivada da aprovação oficial quando disponível.

OAuth agora exige `HOTMART_BASIC_TOKEN`, monta `Authorization: Basic <valor>` exclusivamente no servidor, preserva `client_id`, `client_secret` e `grant_type=client_credentials`, valida resposta bearer/expiração, mantém token somente em memória e realiza no máximo uma renovação controlada quando o refund recebe 401.

`HOTMART_ENVIRONMENT` tornou-se obrigatório e aceita somente `sandbox` ou `production`. A autenticação usa `https://api-sec-vlc.hotmart.com/security/oauth/token`; APIs financeiras usam `https://sandbox.hotmart.com` no sandbox e `https://developers.hotmart.com` em produção. Ambiente ausente ou inválido falha antes de qualquer chamada. O helper de homologação recusa explicitamente produção. A Hotmart não oferece, na documentação consultada, verificação programática do tipo da credencial; a coerência da credencial criada na plataforma continua responsabilidade operacional.

O readiness administrativo informa apenas presença das variáveis e o ambiente selecionado, nunca valores. A homologação interna permanece 35/35 PASS. A externa continua interrompida no readiness até configuração manual, deploy autorizado e produto sandbox; nenhum serviço externo, banco, migration, e-mail ou refund foi acionado nesta correção.

O refund passou a registrar `requesting/refund_reconciliation_required` antes da chamada externa. Aceite, rejeição comprovada e resultado incerto são finalizados por RPC transacional; falha local posterior mantém o estado bloqueante já gravado e nunca orienta nova solicitação financeira. HTTP 408, 429 e respostas 5xx são tratados como incertos. O webhook `REFUNDED` continua sendo a única confirmação financeira final.

## 51. Validação de data comercial e lookup de produto por UCODE

A data comercial da Jornada continua sendo exclusivamente `purchase_approved_at`; processamento inicial e reprocessamento não a substituem por `now()`. Antes de criar, converter ou ativar uma matrícula, o processador calcula a expiração com a duração vigente da Jornada. Se a validade já terminou ou a aprovação é ausente/inválida, a concessão não cria matrícula, cronograma ou vínculo de acesso e permanece em `processing_error` com `COMMERCIAL_DATE_REQUIRES_REVIEW`. O histórico registra `commercial_date_requires_review` com aprovação, expiração calculada, destino e Jornada, sem segredos. A aba Pendências apresenta esses dados para revisão administrativa.

Na criação manual de mapping, o Admin informa o UCODE e aciona **Buscar produto**. O backend protegido por Admin consulta `GET /products/api/v1/products` com paginação controlada, OAuth server-side compartilhado, timeout e retry único após 401, respeitando estritamente `HOTMART_ENVIRONMENT`. Somente `ucode` e `name` retornam ao browser. O nome fica somente leitura e, ao salvar, é validado novamente no servidor; produto ausente, credencial inválida, indisponibilidade, timeout e mapping duplicado falham fechados. O modal de Pendências continua usando o nome e o UCODE persistidos pelo webhook, sem consulta externa adicional.

## 52. Homologação de 2026-09-14 — OAuth Sandbox, catálogos Sandbox/Production, lookup por UCODE por ambiente e redesign do card de Transações

Esta seção consolida toda a Sprint de homologação executada em 2026-09-14 na branch `hotmart-homologacao` (worktree isolada; `main` nunca foi tocada). Reconstruída a partir do histórico Git da branch e do código atual, sem inventar fatos.

### 52.1 Reset do ambiente de homologação

O mapping sintético `fb056612-bcc6-4217-9e6d-2a5d1110ac2f` ("Produto test postback2") foi removido do banco (mapping + transação + access link + histórico associados), após confirmar que pertencia exclusivamente ao produto sandbox, apontava só para a "Jornada de Teste" e não tinha nenhuma outra transação legítima vinculada. Objetivo: reproduzir do zero o fluxo `nova compra → produto desconhecido → pending_mapping → Admin cria vínculo manual → reprocessa → acesso concedido`. Nenhuma migration foi necessária; nenhuma outra Jornada ou mapping foi tocado.

### 52.2 Diagnóstico e correção do OAuth Sandbox (401)

Auditoria mostrou que o card "Configurada" do painel dependia somente de `HOTMART_HOTTOK` (usado só pela assinatura do webhook), nunca de `HOTMART_CLIENT_ID/CLIENT_SECRET/BASIC_TOKEN` — por isso o painel podia mostrar "Configurada"/"sandbox" mesmo com o lookup falhando. Foi adicionado logging sanitizado (`[HOTMART_OAUTH_DIAGNOSTIC]`, sem nunca logar client_id/client_secret/Basic/token/Authorization) diretamente em `getHotmartAccessToken()` (`app/lib/server/hotmart/refund.ts`), cobrindo falha de config, erro de rede e resposta HTTP não-ok do OAuth, com `phase`, `environment`, `status` e `status_text`. Com o log ativo em Preview, identificou-se HTTP 401 na chamada real a `POST https://api-sec-vlc.hotmart.com/security/oauth/token`. A causa raiz confirmada foi a credencial armazenada em `HOTMART_BASIC_TOKEN` conter o prefixo literal `"Basic "` duplicado — o código já monta `` `Basic ${HOTMART_BASIC_TOKEN}` ``, então a variável deve conter só o token puro. Corrigido operacionalmente na Vercel (fora do código); após a correção e um redeploy sem cache, o OAuth Sandbox passou a autenticar corretamente, confirmado pelo mesmo log de diagnóstico sem mais 401.

### 52.3 Catálogo Sandbox e listagem administrativa temporária

Com o OAuth funcionando, foi criada uma consulta read-only ao catálogo Sandbox (`GET /products/api/v1/products` contra `sandbox.hotmart.com`), exposta por `listHotmartSandboxProducts()` em `app/lib/server/hotmart/products.ts` e pela rota `GET /api/admin/hotmart/products`, reaproveitando o OAuth já existente. A UI ganhou o botão "Listar produtos Sandbox" na aba Produtos vinculados, mostrando somente `name`/`ucode`, com "Copiar UCODE". Essa listagem confirmou que o catálogo Sandbox da Hotmart é **sintético** — produtos fictícios de teste, diferentes do catálogo real da conta — o que já era esperado, mas ficou comprovado na prática: o UCODE sintético `fb056612-...` ("Produto test postback2") não corresponde a nenhum produto real.

### 52.4 UCODE fora do UUID RFC estrito

Ao listar o catálogo Sandbox, foi obtido um produto real do tipo "Marketing Digital do Zero" com UCODE `57912595-BA4B-02E0-8C72-71CB71E13136`. O lookup por esse UCODE falhava com "Informe um Product UCODE válido.". Causa raiz: o regex de validação (`products/lookup/route.ts`) exigia formato UUID RFC 4122 estrito (nibble de versão `[1-5]` e variante `[89ab]`); o 3º grupo desse UCODE (`02E0`) começa com `0`, fora de `[1-5]`. A Hotmart não garante esses nibbles. A regra foi substituída por `HOTMART_UCODE_PATTERN` (exportada de `app/lib/server/hotmart/products.ts`): estrutura hexadecimal 8-4-4-4-12, sem exigência de versão/variante, `case-insensitive`, reaproveitada por todas as rotas que validam UCODE (lookup Sandbox, criação de mapping, lookup Production).

### 52.5 Normalização case-insensitive do UCODE

Todo UCODE é normalizado para minúsculas antes de comparar ou gravar: no lookup (Sandbox e Production), na criação de mapping (`POST /api/admin/hotmart`) e na busca de mapping durante o processamento do webhook (`processor.ts`, comparação `.eq("hotmart_product_ucode", event.product.ucode.toLowerCase())` — única linha alterada no processor, sem tocar em mais nada do webhook). A comparação entre o UCODE informado pelo Admin e o `ucode` devolvido pela API Hotmart (que pode vir em maiúsculas) já usava `.toLowerCase()` dos dois lados. Isso resolve duplicidade por diferença de caixa **na camada de aplicação**; o índice único do banco (`unique_hotmart_product_mappings_ucode`) continua case-sensitive no schema — nenhuma migration foi criada para isso, pois a aplicação garante hoje que só se grava/compara em minúsculas.

### 52.6 Lookup Sandbox por UCODE homologado

Com regex e normalização corrigidos, `GET /api/admin/hotmart/products/lookup?ucode=...` passou a encontrar corretamente tanto o UCODE sintético anterior (`fb056612-...`) quanto o UCODE real (`57912595-...`) obtido do catálogo Sandbox.

### 52.7 Credenciais read-only de Production isoladas

Foram criadas, somente no escopo Preview da Vercel, três variáveis novas: `HOTMART_PRODUCTION_CLIENT_ID`, `HOTMART_PRODUCTION_CLIENT_SECRET`, `HOTMART_PRODUCTION_BASIC_TOKEN`. Elas alimentam exclusivamente o módulo novo `app/lib/server/hotmart/productionCatalog.ts`, com cache de token próprio (`cachedProductionToken`, variável de módulo isolada — nunca compartilha token/cache com `refund.ts`), sem nenhuma dependência de `HOTMART_ENVIRONMENT` e sem nenhum uso por webhook, processor, refund, reprocessamento ou mapping automático. Um 503 inicial ("A credencial de produção da Hotmart não está configurada corretamente.") foi diagnosticado por leitura de código como o mesmo padrão já visto no OAuth Sandbox (env var ausente/vazia no runtime daquele deployment específico ou variável adicionada após o build — env vars da Vercel não são retroativas); resolvido após configuração/redeploy pelo responsável.

### 52.8 Catálogo Production read-only

`GET /api/admin/hotmart/products/production` lista o catálogo **real** da conta Hotmart (`GET https://developers.hotmart.com/products/api/v1/products`, nunca `sandbox.hotmart.com`), devolvendo somente `name`/`ucode`. Confirmado listando corretamente os produtos reais da conta. A UI ganhou "Listar meus produtos Hotmart" na mesma aba, em seção visualmente distinta (âmbar, aviso "Consulta somente leitura. Nenhuma venda, acesso ou configuração da Hotmart será alterada."), com "Copiar UCODE" e "Usar este produto".

### 52.9 Lookup por UCODE dividido por ambiente

`GET /api/admin/hotmart/products/lookup` (Sandbox) e a nova `GET /api/admin/hotmart/products/production/lookup` (Production, via `lookupHotmartProductionProductByUcode()` em `productionCatalog.ts`, reaproveitando o mesmo OAuth/paginação/timeout/retry-401 do catálogo Production) resolvem a inconsistência em que um UCODE real não podia ser encontrado pelo botão "Buscar produto" enquanto o Preview estivesse em `HOTMART_ENVIRONMENT=sandbox`. O formulário "Vincular produto" ganhou o estado explícito `productSource` ("sandbox" | "production", default "sandbox" nesta branch de homologação para preservar comportamento) e um seletor visível "Origem do produto Hotmart"; o botão "Buscar produto" chama o endpoint correspondente à origem selecionada, sem o Admin precisar saber qual rota existe.

### 52.10 "Usar este produto"

Implementado nas duas listagens (Sandbox e Production): preenche `Product UCODE` e `Nome do produto` diretamente, sem nova consulta, e define a origem correspondente (`fillProductFromCatalog(product, "sandbox" | "production")`). Salvar o vínculo continua usando o fluxo existente e não foi alterado nesta Sprint — o teste funcional de salvar um mapping real de produção fica para autorização separada.

### 52.11 Nenhuma alteração de ambiente global nem escrita em Production

Em nenhum momento desta Sprint `HOTMART_ENVIRONMENT` foi alterado (permanece `sandbox`), nem foi feita qualquer operação de escrita na conta Hotmart de produção — a consulta a `developers.hotmart.com` é exclusivamente `GET`, sem mapping automático, sem reprocessamento, sem refund, sem webhook.

### 52.12 Redesign premium do card de Transações

O card de transação (compartilhado por Transações, Pendências e Compras em duplicidade via a função `renderTransactionCard`, reduzindo a duplicação anterior entre um formato rico só em Pendências e um formato técnico de uma linha nas demais abas) segue o Dark Premium oficial (`et-admin-dark-list-card`, `et-admin-dark-badge-*`, `et-admin-dark-label`, `et-admin-dark-divider`, sem paleta paralela), com hierarquia Produto → Compra → Comprador → Acesso no EstudoTOP → Transação/situação. Mostra: nome do produto (fallback "Produto não identificado"), UCODE com "Copiar UCODE", data comercial (`purchase_approved_at`, com fallback para `purchase_created_at` quando ausente — nunca `received_at`/`created_at` interno), situação da compra e situação no EstudoTOP sempre traduzidas (reaproveita `purchaseStatusLabel`/`processingStatusLabel` já existentes, não duplicadas), comprador (nome quando existir, e-mail sempre, sem CPF/telefone).

**Valor/moeda:** `hotmart_transactions.amount`/`currency` já são persistidos pelo webhook. Com os dois presentes, formata com `Intl.NumberFormat("pt-BR", {style:"currency",currency})` usando a moeda REAL da transação — **nunca assume `"BRL"` como padrão**. Com `amount` presente e `currency` ausente, mostra o valor numérico neutro (`formatPlainAmount`) com a nota "(moeda não informada)", sem inventar moeda. Com `amount` ausente, nada é exibido.

**Bloco de Acesso — estado do vínculo (`linkState`), derivado exclusivamente do mapping do produto por UCODE, nunca de `processing_status`:**
- **Vinculado** (`linkState === "linked"`): existe mapping **ativo** para o UCODE E seu destino (Jornada/Evento) foi resolvido — mostra tipo + nome do destino; **não mostra o botão Vincular**.
- **Destino indisponível** (`linkState === "destination_unavailable"`): existe mapping **ativo**, mas o destino não pôde ser resolvido — alerta âmbar, sem fingir "Vinculado"; sem botão Vincular (evitaria criar um segundo mapping para o mesmo UCODE, rejeitado pela API com 409).
- **Vínculo inativo** (`linkState === "mapping_inactive"`): existe um mapping para o UCODE, mas está `inactive`/`archived` — **não conta como vínculo operacional**; orienta reativar em Produtos vinculados; sem botão Vincular pelo mesmo motivo do 409 acima.
- **Produto não vinculado** (`linkState === "unlinked"`): **nenhum** mapping existe para o UCODE, em qualquer status — mostra "Destino: Nenhum" e o botão **Vincular** (laranja, `dark-primary`).

`canLink` (exibição do botão Vincular) = `linkState === "unlinked"`, **independente do `processing_status` da transação** — corrigido nesta revisão após constatar que a condição original (`processing_status === "pending_mapping" && !mapping`) escondia indevidamente o botão em transações sem nenhum mapping mas com outro `processing_status` (ex.: `processing_error`, `blocked_financial`). `processing_status` continua sendo exibido normalmente como a situação da transação (badge "Situação no EstudoTOP"), mas deixou de ser critério para esconder a ação Vincular.

**Reutilização de modal:** "Vincular" reaproveita integralmente `openMappingModal`/`PremiumModal`/`savePendingMapping` já homologados em Pendências — nenhuma lógica server-side nova, nenhuma rota nova. O modal sempre oferece "Salvar vínculo"; oferece também **"Vincular e reprocessar"** somente quando o `processing_status` da transação está na mesma lista de elegibilidade que `processor.ts::HOTMART_COMMERCIAL_PROCESSING_ELIGIBLE` (`received`, `pending_mapping`, `pending_destination`, `processing_error`, `refund_reconciliation_required`) — espelhada no frontend como `HOTMART_REPROCESS_ELIGIBLE_STATUSES`, já que o módulo do processor é server-only e não pode ser importado no client component. Fora dessa lista, só "Salvar vínculo" é oferecido, evitando propor reprocessamento sem sentido para o estado atual da transação. Nenhum reprocessamento é disparado automaticamente pelo Admin clicar em "Vincular" — só ao clicar explicitamente em "Vincular e reprocessar".

**Mapping é por produto, não por transação:** o vínculo Hotmart (`hotmart_product_mappings`) é definido por `hotmart_product_ucode` → destino, nunca por `transaction_code` individual. Consequência: todas as transações de um mesmo UCODE compartilham o mesmo `linkState` — se o UCODE já tem mapping ativo válido, toda transação desse produto aparece "Vinculada" ao mesmo destino; não é criado (nem permitido pela API, que responde 409) mapping duplicado por transação.

Responsivo: empilha em telas estreitas, duas colunas a partir de `lg` (≥1024px), UCODE quebra com `break-all`.

### 52.13 Destino de mapping: Jornada e Evento suportados; Simulado direto não

Auditado o schema (`hotmart_product_mappings_destination_check`, `hotmart_transactions_destination_check`, `hotmart_access_links_destination_check` na migration `20260828110000_create_hotmart_integration.sql`): todos os três `CHECK` só permitem `destination_type` `'jornada'` ou `'event'`; não existe coluna `simulado_id` em nenhuma das tabelas Hotmart. **Simulado direto não é destino suportado pelo modelo atual** e exigiria extensão arquitetural (nova coluna + ajuste dos três `CHECK` + `processor.ts`). Nenhuma migration foi criada; a decisão de ampliar o modelo é do responsável pelo projeto.

### 52.14 Limitação conhecida do Sandbox — postback sintético reutiliza o mesmo transaction_code

Confirmado por `hotmart_webhook_events`: o "Testar postback" do Sandbox Hotmart sempre reutiliza o mesmo `transaction_code` sintético (`HP16015479281022`) a cada novo disparo, dentro de um lote fixo de ~8 tipos de evento. Isso significa que testes futuros de ponta a ponta no Sandbox vão colidir com qualquer linha anterior ainda existente para esse código — a limpeza (52.1) pode precisar ser repetida antes de cada rodada de teste limpa.

### 52.15 O que está homologado e o que ainda não está

**Homologado nesta Sprint, em `hotmart-homologacao`:** OAuth Sandbox; catálogo Sandbox (listagem e lookup); regra de UCODE (8-4-4-4-12 hex, case-insensitive); OAuth Production read-only; catálogo Production read-only (listagem e lookup); separação de origem no formulário de vínculo; card premium de Transações/Pendências/Compras em duplicidade.

**Não homologado / pendente:** salvamento efetivo de um mapping com UCODE real de produção (só o preenchimento do formulário foi implementado); merge de `hotmart-homologacao` com `main`; qualquer deploy em Production da Vercel; webhook autenticado real vindo da Hotmart de produção; refund real; Simulado como destino direto de mapping (exige extensão de schema, não implementada). Nada disso deve ser considerado concluído até autorização e validação explícitas do responsável.
