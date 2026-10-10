# PLATFORM-BACKLOG · Backlog da plataforma (Kubernetes, domínio, admin da plataforma e operação)

Status: DONE
Wave: fora das ondas (planejamento) · Agent finished: 2026-10-10 14:31

## Done

- Índice do backlog em `docs/plans/PLATAFORMA-BACKLOG.md`. Contém:
  - tabela com ID, título, épico, prioridade, estimativa e dependências;
  - resumo por épico;
  - ordem sugerida e caminho crítico P0.
- 46 tarefas em `docs/plans/backlog/001-…046-*.md`, cada uma pronta para virar issue do GitHub. A
  primeira linha é `# <título>`, e cada arquivo tem as seções Contexto, Objetivo, Escopo
  (incluído e fora), Critérios de aceite, Notas técnicas, Riscos e Dependências.

| Épico | Tarefas |
|---|---|
| Kubernetes | 001–014 (14) |
| Domínio e DNS | 015–020 (6) |
| Admin da plataforma | 021–030 (10) |
| Gestão de usuários do tenant | 031–034 (4) |
| Comercial e cobrança | 035–037 (3) |
| Operação e confiabilidade | 038–042 (5) |
| Distribuição mobile | 043–046 (4) |

- Onze tarefas são de decisão ou incluem decisão:
  - 001, 002, 003, 008, 015, 019, 025, 034, 035, 036, 045.
  - Os títulos que começam com "Decisão:" produzem documento de decisão.
  - 008 e 019 são "decisão + implementação".

## Tests

- `ls docs/plans/backlog | wc -l` → `46`.
- Cada arquivo começa com `# ` e contém as sete seções obrigatórias → 46 de 46 em cada seção.
- `grep -c "^| 0" docs/plans/PLATAFORMA-BACKLOG.md` → `46` linhas na tabela.
- Documentação apenas, sem código alterado, por isso `pnpm check` não se aplica.

## Assumptions

- O nome de domínio ainda não existe. Os hosts atuais (`agrorende.com.br`, `app.`, `ws.`,
  `staging.`) são tratados como provisórios até a tarefa 015.
- Nomes novos aparecem sempre como **propostos** e exigem change request (regra R4) antes da
  implementação. Os principais:
  - variáveis de ambiente: `PLATFORM_HOST`, `MEDIA_DRIVER=s3` com `MEDIA_S3_*`, `EMAIL_DRIVER`,
    `EMAIL_FROM`, `EMAIL_API_KEY`, e os segredos `ANDROID_KEYSTORE_*`;
  - campos: `modules`, `access`, `isDemo`;
  - jobs: `demo.reset`;
  - rotas: `POST /api/v1/billing/webhook`;
  - códigos de erro: `PLAN_LIMIT_REACHED`;
  - ações de auditoria: `org.limits.override`, `org.modules.override`, `org.demo.reset`.
- Os fatos externos estão marcados como "confirmar" nas tarefas, porque mudam com o tempo:
  - regras do Registro.br (CPF/CNPJ);
  - regiões dos provedores (por exemplo, a DigitalOcean não tem região no Brasil);
  - regulamento da ANPD sobre transferência internacional;
  - exigências da Google Play e da Apple;
  - NFS-e versus NF-e.
- Estimativas: P = até 1 dia, M = cerca de 2 dias, G = cerca de 3 dias. Tarefas G podem ser
  divididas ao virar issue.
- A tarefa 044 (Google Play, teste interno) usa as páginas de privacidade já publicadas na
  landing. A revisão jurídica 042 é exigida só antes da produção aberta.

## Gaps

- Nenhuma issue foi criada no GitHub. O pedido foi apenas gerar os arquivos.
- As estimativas de custo da tarefa 001 dependem de cotações atuais dos provedores, a serem feitas
  na execução.

## Error cases added

- Nenhum implementado. Os códigos propostos, como `PLAN_LIMIT_REACHED` e o erro de módulo
  desligado, estão descritos nas tarefas 027 e 028 e devem entrar em `docs/ERRORS.md` por change
  request.

## Change requests

- Nenhuma criada nesta tarefa. As tarefas indicam onde cada change request será necessária.

## Edits outside owned paths (T10, T11, T12 only)

- Nenhuma. Foram criados apenas `docs/plans/PLATAFORMA-BACKLOG.md`, `docs/plans/backlog/*.md` e
  este arquivo.

## Notes for the next wave

- Comece pelas decisões 015, 001, 002 e 003. O domínio definitivo pode ir ao ar na VM atual
  (016–018 e 038) antes do Kubernetes.
- O driver S3 (009) é pré-requisito real para várias réplicas do web e do worker no cluster,
  porque `packages/core/src/storage/index.ts` só aceita `MEDIA_DRIVER=local`.
- Antes do primeiro deploy no Kubernetes, o site público (`apps/landing`) precisa de imagem
  própria (005). Hoje ele é exportado no `deploy.yml` e servido pelo Caddy.
