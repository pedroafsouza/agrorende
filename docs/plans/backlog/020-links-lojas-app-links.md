# Links das lojas e links universais (App Links e Universal Links)

**ID:** 020 · **Épico:** Domínio e DNS · **Prioridade:** P1 · **Estimativa:** M

## Contexto

- O site lê `SITE_APP_STORE_URL` e `SITE_PLAY_STORE_URL` (`apps/landing/src/lib/config.ts`); a página
  `(admin)/office-role-required` mostra selos das lojas e QR (§14.1).
- Convites e resets são links web `https://APP_HOST/i/[code]` e `/r/[code]`; o app usa esquemas
  personalizados (`agrorende`, `agrorende-preview`, `agrorende-dev` em `apps/mobile/app.config.ts`)
  e `OAUTH_MOBILE_SCHEMES` para OAuth.
- Pacotes: `app.agrorende.field`, `app.agrorende.field.preview`, `app.agrorende.field.dev`.
- Não há `assetlinks.json` nem `apple-app-site-association` publicados hoje.

## Objetivo

Fazer os links de convite e reset abrirem direto no app instalado e publicar URLs corretas das
lojas no site e no admin.

## Escopo

### Incluído

- Publicar `https://APP_HOST/.well-known/assetlinks.json` (SHA-256 da chave de assinatura da Play,
  tarefa 043/044) e `apple-app-site-association` (team id e bundle ids).
- Configurar `intentFilters` com `autoVerify` (Android) e `associatedDomains` (iOS) em
  `apps/mobile/app.config.ts` para `/i/*` e `/r/*`.
- Rota de app para tratar `/i/[code]` e `/r/[code]` reaproveitando os fluxos existentes de convite.
- Preencher `SITE_PLAY_STORE_URL` (e `SITE_APP_STORE_URL` quando houver iOS).
- URLs de política de privacidade, termos e suporte nas fichas das lojas apontando para o site.

### Fora do escopo

- Criação das fichas nas lojas (tarefas 044 e 046).

## Critérios de aceite

- [ ] Em Android com o app instalado, tocar no link de convite do WhatsApp abre o app na tela de
      convite.
- [ ] Sem o app, o link abre a página web atual de convite.
- [ ] Validador de Digital Asset Links do Google passa.
- [ ] Selos do site levam às fichas corretas.

## Notas técnicas

- Mudança de config nativa altera o fingerprint: exige build de loja, não OTA (§18.4).

## Riscos

- Chave errada no `assetlinks.json` quebra a verificação silenciosamente; testar com `adb`.

## Dependências

- 016, 043.
