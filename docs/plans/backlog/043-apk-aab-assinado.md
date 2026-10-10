# APK e AAB assinados com chave guardada em segredos

**ID:** 043 · **Épico:** Distribuição mobile · **Prioridade:** P0 · **Estimativa:** M

## Contexto

- `.github/workflows/android-apk.yml` roda nas tags `vX.Y.Z` e manualmente. Ele faz:
  - `expo prebuild --platform android`;
  - remove de propósito a assinatura de debug do `buildType release`;
  - `./gradlew assembleRelease`;
  - anexa `agrorende-vX.Y.Z-unsigned.apk` e o `.sha256` ao release do GitHub.
- O comentário do workflow diz que o Android recusa instalar o APK até alguém assiná-lo. O passo
  final falha se o APK vier assinado.
- `.github/workflows/mobile.yml` usa EAS na nuvem, com o segredo `EXPO_TOKEN`. Ele faz
  `eas build` quando a fingerprint nativa muda e `eas update` quando não muda. Nas tags `vX.Y.Z`,
  roda o perfil `production` nas duas plataformas.
- O pacote de produção é `app.agrorende.field` (`apps/mobile/app.config.ts`).

## Objetivo

Produzir APK (para distribuição direta) e AAB (para a Play Store) assinados de forma
reproduzível, com a chave fora do repositório.

## Escopo

### Incluído

- Decidir quem guarda a chave de upload:
  - credenciais gerenciadas pelo EAS (`eas credentials`);
  - keystore própria em segredos do GitHub (`ANDROID_KEYSTORE_BASE64`,
    `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — nomes propostos).
  Recomendar a Play App Signing, em que o Google guarda a chave do app e a AgroRende só a chave de
  upload.
- Gerar a keystore fora do repositório, com cópia de segurança em cofre (dois responsáveis).
- Estender `android-apk.yml`, ou criar um job novo, para assinar com `apksigner` e gerar
  `bundleRelease` (AAB). Manter a saída não assinada se ainda for útil. Essa mudança em
  `.github/**` exige change request, por causa da regra R4.
- Verificar a assinatura no CI (`apksigner verify --print-certs`) e publicar o SHA-256 do
  certificado. Esse valor é necessário para Android App Links (tarefa 020) e para o OAuth do
  Google.
- Atualizar `docs/RELEASING.md`.

### Fora do escopo

- Publicação na Play Store (tarefa 044).

## Critérios de aceite

- [ ] O APK do release instala num Android limpo sem aviso de pacote inválido.
- [ ] O AAB é aceito pelo Play Console (upload manual de teste).
- [ ] Nenhum arquivo de chave ou senha aparece em logs do CI ou no repositório.
- [ ] O procedimento de rotação e recuperação da chave de upload está documentado.

## Notas técnicas

- `versionCode` precisa crescer a cada build enviado à Play Store. Definir a origem do número
  (tag, `run_number` ou EAS `autoIncrement`).

## Riscos

- Perder a keystore sem Play App Signing impede atualizar o app. Por isso a recomendação acima.

## Dependências

Nenhuma.
