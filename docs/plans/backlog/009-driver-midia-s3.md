# Driver de mídia S3-compatível (`MEDIA_DRIVER=s3`)

**ID:** 009 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** G

## Contexto

O seam de armazenamento está em `packages/core/src/storage/index.ts` (§7.7). Hoje só existe o
driver local (`packages/core/src/storage/local.ts`); a função que lê `MEDIA_DRIVER` lança
`Unsupported MEDIA_DRIVER "...": only "local" ships in the MVP (s3 is Phase 2).` para qualquer
valor diferente de `local`. Na VM, `web` e `worker` montam `/srv/agrorende/media` em `/data/media`.
URLs de upload/leitura são assinadas com `MEDIA_URL_SECRET` e servidas pelas rotas
`/api/v1/media/:id/blob*`. A Fase 2 prevê bucket privado com versionamento, CORS só para a origem
do web, abortar multipart incompleto após 1 dia e lifecycle para camada fria após 90 dias
(`infra/aws/README.md`).

Sem esse driver, `web` e `worker` não escalam horizontalmente no Kubernetes (o volume local não é
compartilhado).

## Objetivo

Implementar o driver `s3` no seam existente, compatível com qualquer armazenamento S3 (AWS S3,
GCS interoperável, MinIO, Magalu Object Storage), e migrar a mídia existente.

## Escopo

### Incluído

- Implementar as operações do seam (`MediaStore` em `packages/core/src/storage/index.ts`): escrita,
  leitura com `Range`, multipart com partes de 8 MiB, conclusão, exclusão e `stat`.
- Decidir entre continuar servindo pelo Node (rotas `blob*`, mantendo o contrato atual) ou usar
  URLs pré-assinadas do S3 diretamente; a segunda opção muda o contrato da §7.7 e exige change
  request e atualização do app móvel.
- Variáveis novas propostas (precisam de change request para §16/§18 e `.env.example`):
  `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_FORCE_PATH_STYLE`;
  credenciais via identidade de workload.
- Saúde: `/api/v1/health` e a saúde do worker hoje verificam `MEDIA_ROOT` gravável; adaptar para o
  driver `s3` (ex.: `HeadBucket`).
- Ferramenta de migração `local → s3` idempotente, com verificação de tamanho/etag.
- Testes com MinIO em Docker no CI.

### Fora do escopo

- CDN para leituras assinadas (futuro).

## Critérios de aceite

- [ ] `MEDIA_DRIVER=s3` aceito; `local` continua padrão e com testes verdes.
- [ ] Upload simples (≤ 15 MB) e multipart, leitura com `Range` e miniaturas funcionam contra MinIO.
- [ ] Erros seguem `docs/ERRORS.md` (`MEDIA_TOO_LARGE` 413, `FORBIDDEN` para token inválido).
- [ ] `orgs.purge` (`apps/worker/src/jobs/orgs.purge.ts`) apaga os objetos do prefixo da
      organização no bucket.
- [ ] Migração de 1 000 arquivos de teste concluída com relatório de verificação.
- [ ] `pnpm check:only` dos pacotes tocados verde.

## Notas técnicas

- Prefixo de chave por organização (ex.: `<organizationId>/<mediaId>/<variant>`) para facilitar
  purge e exportação LGPD.
- Adicionar o SDK S3 exige `pnpm add`, congelado pela regra R4 do `docs/DELIVERY-PLAN.md`; pedir a
  exceção ao dono das fundações antes.

## Riscos

- Custos de egress na leitura de mídia pelo Node; avaliar URLs pré-assinadas.
- Consistência durante a migração; congelar uploads ou usar escrita dupla curta.

## Dependências

- 001 (provedor e região do bucket).
