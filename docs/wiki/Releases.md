# Releases

Resumo de [`docs/RELEASING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/RELEASING.md),
que é a fonte oficial (com os segredos, variáveis e passos humanos de cada ambiente).

## Ambientes

`APP_ENV` escolhe o ambiente. Ambientes que não são produção mostram uma faixa no cabeçalho do
painel e na tela Hoje do app. `pnpm db:seed`, `db:reset` e `storage:seed` recusam rodar com
`APP_ENV=production`.

| Ambiente | Onde | Dados | Servidor | Mobile | Como chega lá |
|---|---|---|---|---|---|
| `local` | Sua máquina | `docker-compose.yml` da raiz + seed | `pnpm dev` ou containers parecidos com produção | Dev client (`development`) | `pnpm devloop` |
| `ci` | Runner do GitHub | Serviços do Compose + seed | Testado por `ci.yml`; imagens construídas por `release.yml` | Jest e `expo export` | Todo pull request e push na `main` |
| `staging` | VM em São Paulo | `mongo:8` na VM, seed + dados sintéticos, nunca cópia de produção | Imagens `sha-<12>` da `main` | Builds `preview`, canal EAS `preview` | `release.yml` → `deploy.yml`, automático |
| `production` | VM em São Paulo + MongoDB Atlas M10 (`sa-east-1`) | Atlas com backup contínuo | Imagens `vX.Y.Z` (os digests do staging, promovidos) | Builds de loja, canal EAS `production` | `deploy.yml`, aprovado por um revisor |

O mock OIDC existe só no `docker-compose.yml` da raiz. Staging e produção usam os provedores reais
de Google e Apple, e `infra/scripts/validate-env.sh` rejeita configurações que apontem para o mock
ou para `localhost`.

## Versionamento

- Releases do servidor são tags `vX.Y.Z` num commit da `main`. Minor para funcionalidades, patch
  para correções, major para mudanças incompatíveis do protocolo de sync (que também é versionado
  pelo caminho `/api/v1`).
- Toda imagem construída na `main` recebe a tag `sha-<12 primeiros caracteres do commit>`. Uma tag
  de release **reaproveita os digests exatos do staging**; tags nunca recompilam.
- Imagens: `ghcr.io/<owner>/agrorende-web`, `agrorende-migrate`, `agrorende-realtime`,
  `agrorende-worker` e `agrorende-backup`.
- O mobile usa o `version` de [`apps/mobile/app.config.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/app.config.ts)
  e `runtimeVersion: { policy: "fingerprint" }`.
- As releases têm nomes de safra: a MVP é "Primeira safra" e a v1.1, "Segunda safra"
  ([`docs/PRD.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/PRD.md) §14).

## Fluxo de release

1. **Pull request:** `release.yml` constrói as cinco imagens e o artefato do site
   (`site.tar.gz`, de `apps/landing/out`) sem publicar nada; `ci.yml` roda os testes.
2. **Merge na `main` → staging:** `release.yml` publica as imagens `sha-<12>` com proveniência e
   SBOM e chama `deploy.yml` com `environment: staging`, que faz o deploy e roda `pnpm smoke`.
3. **Release de produção** — passo **[human]**:
   1. Escolha um commit da `main` cujo deploy em staging deu certo e foi conferido por uma pessoa.
   2. `git tag -a v1.2.0 <commit> -m "v1.2.0"` e `git push origin v1.2.0`.
   3. `release.yml` (job `promote`) confere a tag, re-tagueia os digests como `v1.2.0` e cria a
      GitHub Release.
   4. **Actions → deploy → Run workflow** com `environment: production` e `image_tag: v1.2.0`. O job
      `guard` confere tudo; um revisor aprova o ambiente `production`.
   5. A mesma tag dispara `mobile.yml` (perfil `production`) e `android-apk.yml`.

## Mobile: atualização pelo ar ou build de loja

`mobile.yml` calcula o fingerprint nativo de cada plataforma:

- Se já existe um build EAS com o mesmo fingerprint, só o JavaScript mudou: publica com
  `eas update --channel <perfil>`, e os apps instalados recebem na próxima abertura.
- Se não existe, algo nativo mudou: dispara `eas build` na nuvem da Expo e, em produção,
  `--auto-submit` para as lojas.

Precisa do segredo `EXPO_TOKEN`. Pull requests com o rótulo `mobile-preview` ganham uma atualização
no branch EAS `pr-<número>` e um comentário com QR code.

## APK Android não assinado

[`android-apk.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/android-apk.yml)
anexa um APK **não assinado** da variante de produção a cada GitHub Release, para testadores e
instalação fora das lojas. Não precisa de conta Expo.

- **Gatilho:** a mesma tag `vX.Y.Z`. O job faz `expo prebuild --platform android --clean` e
  `./gradlew assembleRelease` no runner, espera até 30 minutos a release aparecer e envia
  `agrorende-vX.Y.Z-unsigned.apk` e `agrorende-vX.Y.Z-unsigned.apk.sha256`. Os arquivos também
  ficam como artefato do workflow por 30 dias.
- **Execução manual:** **Actions → android-apk → Run workflow** com `tag` (uma release `vX.Y.Z`
  existente, cujo APK é substituído) e `variant` (`production` ou `preview`). Com `tag` vazio, o
  branch escolhido vira só um artefato (`agrorende-<sha>[-preview]-unsigned.apk`).
- **Por que não assinado:** nenhuma chave vive na CI. O Android recusa instalar um APK sem
  assinatura ("App não instalado" / `INSTALL_PARSE_FAILED_NO_CERTIFICATES`).

Para assinar com a sua própria chave (ferramentas em `$ANDROID_HOME/build-tools/<versão>/`):

```bash
# Uma vez: crie um keystore (fora do repositório).
keytool -genkeypair -v -keystore agrorende-sideload.jks -alias agrorende \
  -keyalg RSA -keysize 4096 -validity 10000

sha256sum -c agrorende-v1.2.0-unsigned.apk.sha256
zipalign -p -f 4 agrorende-v1.2.0-unsigned.apk agrorende-v1.2.0-aligned.apk
apksigner sign --ks agrorende-sideload.jks --ks-key-alias agrorende \
  --out agrorende-v1.2.0.apk agrorende-v1.2.0-aligned.apk
apksigner verify --print-certs agrorende-v1.2.0.apk
adb install agrorende-v1.2.0.apk
```

Um app assinado com uma chave não pode ser atualizado por outro assinado com chave diferente
(incluindo o da Play Store); desinstale antes.

## Migrações

A imagem `migrate` roda [`packages/db/migrations/runner.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/db/migrations/runner.ts),
o mesmo código de `pnpm db:migrate`: aplica os índices e cada migração pendente em ordem. As
migrações são compatíveis com a release anterior, então o banco não volta num rollback.

## Rodar as imagens de produção localmente

```bash
docker compose -f docker-compose.yml -f infra/compose/app.yml up --build
```

Roda as imagens de produção contra o MongoDB e o Redis locais. Mais verificações locais em
[`docs/RELEASING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/RELEASING.md) §8.

## Rollback

- **Servidor:** **Actions → deploy → Run workflow** com o `image_tag` anterior (`vX.Y.Z`, ou
  `sha-<12>` em staging).
- **Mobile:** `eas update:republish --group <id do grupo anterior>`. Build de loja não volta;
  corrija para frente.
