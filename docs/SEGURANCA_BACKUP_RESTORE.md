# Segurança de backup e restore

## Escopo do backup

- Supabase Postgres, incluindo Auth quando suportado pelo procedimento oficial.
- Supabase Storage; backup do banco não implica backup dos objetos.
- Repositório, migrations e documentos operacionais.
- Configuração do cron e inventário de variáveis, nunca os valores em texto aberto no Git.
- Evidências e logs críticos disponíveis nos fornecedores.

## Backup automático

O repositório não comprova o plano contratado nem se backups automáticos/PITR estão habilitados. Antes de produção, o responsável deve verificar no painel Supabase:

- último backup concluído e ausência de falhas;
- frequência mínima diária;
- retenção recomendada de 30 dias para backups diários;
- disponibilidade de PITR quando o RPO exigido for inferior a 24 horas;
- escopo de Auth e limitações do restore.

Registrar mensalmente data, projeto, responsável, horário do último backup e evidência do painel.

## Backup manual

Gerar snapshot/exportação controlada antes de migration, deploy crítico, operação em massa, anonymização ou correção destrutiva. Nunca versionar dumps com dados pessoais ou segredos.

## Storage

O bucket conhecido é `profile-avatars`. Definir cópia externa periódica se esses objetos precisarem ser recuperáveis. Registrar o mapeamento caminho/objeto e validar conteúdo, pois restaurar apenas URLs do banco não restaura arquivos.

## Variáveis de ambiente

O inventário está em `.env.example`: Supabase URL/anon, service role, `CRON_SECRET`, `REGISTRATION_TOKEN_SECRET`, Resend e OpenAI. Valores devem ficar no cofre do provedor, com acesso restrito, rotação e procedimento de recuperação.

## Responsabilidade

- Responsável operacional: `[PREENCHER NOME/FUNÇÃO]`.
- Verificação: semanal para falhas; evidência formal mensal e antes de deploy crítico.
- Evidência: `[PREENCHER LOCAL SEGURO]`, sem dados pessoais desnecessários.

## Teste de restore

Nunca restaurar destrutivamente em produção para testar.

1. Criar projeto Supabase temporário ou ambiente de homologação isolado.
2. Desabilitar cron e bloquear envio real de e-mail.
3. Restaurar o backup mais recente conforme procedimento oficial do plano.
4. Restaurar Storage separadamente, se aplicável.
5. Validar tabelas, constraints, contagens aproximadas e migrations.
6. Testar login admin/aluno, Jornadas, simulados, tentativa, submissão e resultado.
7. Confirmar que e-mails reais e jobs não foram disparados.
8. Descartar o ambiente e dados pessoais com procedimento seguro após a evidência.

Registrar backup usado, data/hora, ambiente, responsável, duração, resultado e problemas. Executar trimestralmente, antes de grandes alterações estruturais e após mudança relevante de infraestrutura.
