# Google Play: conta, ficha da loja e trilha de teste interno

**ID:** 044 · **Épico:** Distribuição mobile · **Prioridade:** P0 · **Estimativa:** M

## Contexto

- O pacote de produção é `app.agrorende.field`. A variante de staging é
  `app.agrorende.field.preview` (`apps/mobile/app.config.ts`).
- `apps/mobile/eas.json` tem os perfis `development`, `preview` e `production`, e um bloco
  `submit.production` vazio.
- A landing já publica as páginas `privacy` e `terms` (`apps/landing/content/`), suficientes para o teste interno; a revisão jurídica (tarefa 042) é necessária antes da produção aberta.
- A landing usa `SITE_PLAY_STORE_URL` para o botão da loja. A tarefa 020 trata os links da loja e
  os App Links.
- O app pede localização durante o serviço e câmera. A Play Store exige declarações de permissão,
  o formulário de segurança de dados e a política de privacidade publicada (tarefa 042).

## Objetivo

Publicar o app na trilha de teste interno da Google Play, com envio automatizado a partir do CI.

## Escopo

### Incluído

- Criar a conta de desenvolvedor da Google Play em nome da empresa (exige CNPJ ou dados da
  organização e verificação de identidade; confirmar as regras atuais). Pagar a taxa única.
- Criar a ficha da loja em pt-BR e en:
  - textos;
  - ícone;
  - capturas de tela;
  - categoria;
  - contato;
  - URL da política de privacidade no domínio novo.
- Preencher a declaração de segurança de dados, a justificativa de localização em segundo plano
  (se usada; confirmar no `app.config.ts`) e a classificação de conteúdo.
- Configurar a conta de serviço para envio automático (`eas submit` ou API do Play), com a chave
  JSON em segredo. Fazer o envio do AAB da tarefa 043 para a trilha `internal` nas tags.
- Lista de testadores internos (equipe e clientes piloto).
- Atualizar `SITE_PLAY_STORE_URL` quando o app for público.

### Fora do escopo

- Lançamento em produção aberta (decidir depois do piloto).
- iOS (tarefa 046).

## Critérios de aceite

- [ ] Testador interno instala o app pela Play Store e entra em staging ou produção.
- [ ] Uma tag `vX.Y.Z` envia automaticamente o build para a trilha interna.
- [ ] Revisão da Play aprovada para teste interno, sem pendências de política.

## Notas técnicas

- Contas novas de pessoa física podem exigir teste fechado com número mínimo de testadores antes
  da produção. Confirmar as regras atuais e preferir conta de organização.

## Riscos

- Rejeição por permissões de localização. Preparar o vídeo e o texto de justificativa.

## Dependências

- 043, 016 (042 antes da produção aberta).
