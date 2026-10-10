# Criar organização pela equipe e convidar o primeiro administrador

**ID:** 023 · **Épico:** Admin da plataforma · **Prioridade:** P0 · **Estimativa:** M

## Contexto

Hoje uma organização nasce pelo autoatendimento: `(auth)/signup` e `(auth)/signup/company` com
ticket Google/Apple e `POST /api/v1/signup/organization` (§8), que cria organização `TRIAL`, usuário
ADMIN, identidade, configurações, sequências e templates padrão. O modelo `Organization` já prevê
`signupSource` com o valor `staff` (§5.3), mas o console da plataforma não tem ação de criação:
oferece apenas listar, ver, alterar status/plano/trial e gerar link de reset para um ADMIN
existente (`POST /platform/orgs/:id/admin-reset-link`). Vendas assistidas (`docs/plans/SIMPLER-TO-SELL.md`
§7 e §8) precisam criar a conta pelo cliente.

## Objetivo

Permitir que a equipe crie uma organização e gere o convite do primeiro ADMIN, com auditoria.

## Escopo

### Incluído

- `POST /api/v1/platform/orgs` (proposto) com `{name, legalName?, taxId?, timezone, locale,
  expectedFieldUsers, plan?, trialEndsAt?, adminName, adminEmail?, adminPhone?, reason}`;
  `signupSource = "staff"`.
- Reaproveitar a criação de organização do sign-up (mesmos defaults: settings, sequências,
  templates) sem duplicar código.
- Criar o ADMIN com convite `AuthLink` kind INVITE (7 dias) e devolver o painel de
  compartilhamento já usado no admin (link, WhatsApp, QR; `SharePanel.tsx`) e, quando a tarefa 031
  existir, envio por e-mail.
- Aceite dos termos: o primeiro ADMIN aceita `TERMS_VERSION` ao resgatar o convite
  (`POST /org/accept-terms`), não a equipe.
- Auditoria `org.create` e `org.adminInvite` em `PlatformAuditEvent`.
- Formulário no console e testes.

### Fora do escopo

- Importação de dados do cliente.

## Critérios de aceite

- [ ] Staff cria organização em staging e o link de convite abre `/i/[code]` com o nome da empresa.
- [ ] Após o resgate, o ADMIN vê o checklist de primeiros passos em `/ops` e é obrigado a aceitar os
      termos.
- [ ] CNPJ inválido retorna erro de validação de campo (`docs/ERRORS.md`).
- [ ] Teste cross-tenant: o staff não recebe `ctx` nem dados de negócio da nova organização.
- [ ] `pnpm check:only` e `pnpm i18n:check` verdes.

## Notas técnicas

- Novos códigos de ação de auditoria precisam entrar na lista da §5.3 via change request.

## Riscos

- E-mail do ADMIN já usado em outra organização (índice único em `users.email`); tratar com erro
  claro e caminho de recuperação.

## Dependências

- 022.
