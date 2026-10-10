# iOS: conta Apple, App Store Connect e TestFlight

**ID:** 046 · **Épico:** Distribuição mobile · **Prioridade:** P2 · **Estimativa:** M

## Contexto

- O app tem `bundleIdentifier` `app.agrorende.field`, com as variantes `.preview` e `.dev`
  (`apps/mobile/app.config.ts`).
- `.github/workflows/mobile.yml` roda o perfil `production` nas duas plataformas nas tags, via
  EAS.
- O Sign in with Apple já existe. O callback é `/api/v1/auth/oauth/apple/callback`, e a
  configuração está descrita em `docs/RUNBOOK.md` §4. A revogação de token está implementada
  (`auth.appleRevoke`).
- A landing tem `SITE_APP_STORE_URL`.

## Objetivo

Distribuir o app iOS para testadores via TestFlight, preparando a publicação na App Store.

## Escopo

### Incluído

- Conta Apple Developer da organização (exige número D-U-N-S da empresa; confirmar as regras
  atuais).
- Criar o app no App Store Connect, com:
  - ficha em pt-BR e en;
  - rótulos de privacidade (App Privacy) coerentes com o inventário da tarefa 042;
  - textos de permissão de localização e câmera revisados.
- Credenciais do EAS (certificado e perfil de provisionamento) e chave da API do App Store Connect
  em segredos. Envio automático para o TestFlight nas tags.
- Associated Domains para Universal Links (tarefa 020), no domínio novo.
- Atualizar `SITE_APP_STORE_URL` na publicação.

### Fora do escopo

- Publicação pública na App Store (decidir após o piloto).

## Critérios de aceite

- [ ] Testador externo instala pelo TestFlight e entra com e-mail, Google e Apple.
- [ ] Uma tag `vX.Y.Z` envia o build para o TestFlight sem passos manuais.
- [ ] Revisão do TestFlight (beta externo) aprovada.

## Notas técnicas

- A Apple exige exclusão de conta dentro do app. O fluxo já existe (PLT-21); conferir que é
  acessível no iOS.

## Riscos

- Rejeição por uso de localização. Preparar a justificativa.

## Dependências

- 016, 020, 042.
