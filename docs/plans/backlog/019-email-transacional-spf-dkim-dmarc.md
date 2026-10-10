# E-mail transacional e caixas da empresa (SPF, DKIM, DMARC)

**ID:** 019 · **Épico:** Domínio e DNS · **Prioridade:** P1 · **Estimativa:** M · **Tipo:** decisão + implementação

## Contexto

O código atual **não envia e-mail**: não há biblioteca SMTP ou de provedor de e-mail em `apps/` ou
`packages/`. Convites e links de redefinição são compartilhados pelo administrador via link,
WhatsApp e QR (`apps/web/src/features/team/SharePanel.tsx`; `POST /users` devolve
`{user, invite: {code, url, whatsappUrl, expiresAt}}`, §8). O Caddyfile usa
`ops@agrorende.com.br` como `ACME_EMAIL`, e o site expõe `SITE_CONTACT_EMAIL` e
`SITE_PRIVACY_EMAIL`. Notificações vão por push Expo (`EXPO_ACCESS_TOKEN`).

## Objetivo

Ter caixas de e-mail da empresa e um provedor transacional autenticado no domínio, prontos para
convites por e-mail (tarefa 031), alertas e comunicação LGPD.

## Escopo

### Incluído

- Caixas/grupos: `ops@`, `suporte@`, `privacidade@` (encarregado/DPO), `financeiro@`,
  `no-reply@`, `security@` (Google Workspace, Microsoft 365 ou roteamento de e-mail).
- Decidir provedor transacional (ex.: Amazon SES `sa-east-1`, Postmark, Resend, SendGrid) por custo,
  entregabilidade, região e DPA; registrar decisão.
- Subdomínio de envio (ex.: `mail.` ou `send.`) com SPF, DKIM e DMARC (`p=none` com relatórios,
  evoluindo para `quarantine`/`reject`).
- Variáveis propostas (change request para §16/§18): `EMAIL_PROVIDER`, `EMAIL_FROM`,
  `EMAIL_API_KEY` (segredo).
- Seam de envio em `packages/core` com driver fake para testes (sem enviar nada em `local` e `ci`).

### Fora do escopo

- Templates de convite (tarefa 031) e marketing.

## Critérios de aceite

- [ ] Teste em `mail-tester.com` (ou equivalente) com nota ≥ 9/10.
- [ ] DMARC com relatórios chegando a uma caixa monitorada.
- [ ] `security.txt` publicado no site com `security@`.
- [ ] Nenhum e-mail real é enviado quando `APP_ENV` é `local` ou `ci`.

## Notas técnicas

- Não registrar endereços de e-mail em logs `info` (§12).
- Adicionar SDK de e-mail exige exceção à regra R4; um cliente HTTP simples pode bastar.

## Riscos

- Domínio novo tem reputação baixa; aquecer o envio e começar com volumes pequenos.

## Dependências

- 015, 016.
