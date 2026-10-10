# Backlog da plataforma: Kubernetes, domínio, admin da plataforma e operação

Este backlog reúne as tarefas para levar a AgroRende da Fase 1 a uma operação de produção
completa. A Fase 1 é uma VM por ambiente, com Docker Compose e Caddy (`infra/compose/`,
`infra/caddy/Caddyfile`, `infra/vm/README.md`). O backlog cobre:

- deploy em Kubernetes;
- domínio próprio e DNS;
- um console de administração da plataforma para a equipe AgroRende;
- lacunas na gestão de usuários das organizações;
- cobrança;
- confiabilidade;
- distribuição do app móvel.

As tarefas partem do que já existe. Cada arquivo cita os caminhos atuais:

- imagens no GHCR publicadas por `.github/workflows/release.yml`;
- deploy por SSH em `.github/workflows/deploy.yml`;
- endpoints de saúde da `docs/ARCHITECTURE.md` §12;
- console da plataforma (T20) em `apps/web/src/features/platform/` e
  `packages/core/src/modules/tenancy/platform.ts`;
- gestão de equipe em `(admin)/team`;
- builds móveis em `.github/workflows/mobile.yml` e `android-apk.yml`.

## Como usar

- Cada tarefa é um arquivo em `docs/plans/backlog/NNN-slug.md`. A primeira linha (`# título`) é
  o título da issue, e o restante do arquivo pode ser colado como corpo de uma issue do GitHub.
- Tarefas cujo título começa com **"Decisão:"** produzem um documento de decisão, não código. Elas
  destravam as tarefas que dependem delas.
- Prioridade:
  - **P0**: necessário para operar em produção com domínio próprio;
  - **P1**: importante logo depois;
  - **P2**: quando houver demanda.
- Estimativa:
  - **P**: até 1 dia;
  - **M**: 2 dias;
  - **G**: 3 dias, e pode ser dividida ao virar issue.
- Nomes novos (variáveis de ambiente, campos, rotas, códigos de erro, jobs) aparecem como
  **propostos**. Pela regra R4 de `docs/DELIVERY-PLAN.md`, mudanças em `packages/contracts`,
  `packages/db`, `.github/**` e dependências exigem change request antes da implementação.
- Fatos externos sujeitos a mudança estão marcados para confirmação no momento da execução, entre
  eles:
  - regras do Registro.br;
  - regiões dos provedores;
  - regulamentos da ANPD;
  - exigências das lojas.

## Resumo por épico

| Épico | Tarefas | IDs |
|---|---|---|
| Kubernetes | 14 | 001–014 |
| Domínio e DNS | 6 | 015–020 |
| Admin da plataforma | 10 | 021–030 |
| Gestão de usuários do tenant | 4 | 031–034 |
| Comercial e cobrança | 3 | 035–037 |
| Operação e confiabilidade | 5 | 038–042 |
| Distribuição mobile | 4 | 043–046 |
| **Total** | **46** | |

## Tarefas

| ID | Título | Épico | Prioridade | Estimativa | Dependências |
|---|---|---|---|---|---|
| 001 | [Decisão: provedor e cluster Kubernetes no Brasil (com estimativa de custo)](backlog/001-decisao-provedor-cluster-kubernetes.md) | Kubernetes | P0 | M | — |
| 002 | [Decisão: GitOps com Argo CD ou Flux e layout de `infra/k8s`](backlog/002-decisao-gitops-argo-flux.md) | Kubernetes | P0 | P | — |
| 003 | [Decisão: MongoDB e Redis gerenciados ou dentro do cluster](backlog/003-decisao-mongodb-redis.md) | Kubernetes | P0 | P | 001 |
| 004 | [Provisionar clusters, namespaces `staging`/`production` e baseline de segurança](backlog/004-provisionar-clusters-namespaces.md) | Kubernetes | P0 | M | 001, 002 |
| 005 | [Imagem de contêiner para o site público (`apps/landing`)](backlog/005-imagem-conteiner-site-publico.md) | Kubernetes | P0 | P | — |
| 006 | [Helm chart `agrorende`: web, realtime, worker, site e job de migração (com HPA e PDB)](backlog/006-helm-chart-agrorende.md) | Kubernetes | P0 | G | 002, 003, 005 |
| 007 | [Ingress, WebSocket e TLS automático (ingress-nginx ou Gateway API + cert-manager)](backlog/007-ingress-websocket-tls.md) | Kubernetes | P0 | M | 004, 016 |
| 008 | [Segredos no cluster: External Secrets Operator ou SOPS](backlog/008-segredos-external-secrets-sops.md) | Kubernetes | P0 | M | 002, 004 |
| 009 | [Driver de mídia S3-compatível (`MEDIA_DRIVER=s3`)](backlog/009-driver-midia-s3.md) | Kubernetes | P0 | G | 001 |
| 010 | [Pipeline: `release.yml` e `deploy.yml` integrados ao GitOps](backlog/010-pipeline-ci-gitops.md) | Kubernetes | P0 | M | 002, 006, 008 |
| 011 | [Observabilidade no cluster: logs, métricas, alertas e Sentry](backlog/011-observabilidade-cluster.md) | Kubernetes | P1 | M | 004 |
| 012 | [Backups e exercício de restauração no Kubernetes](backlog/012-backups-exercicio-restauracao.md) | Kubernetes | P0 | M | 003, 009 |
| 013 | [Migração da VM para Kubernetes (cutover e plano de reversão)](backlog/013-migracao-vm-para-kubernetes.md) | Kubernetes | P0 | M | 007, 010, 012, 017 |
| 014 | [Runbooks e documentação de operação em Kubernetes](backlog/014-runbooks-kubernetes.md) | Kubernetes | P1 | P | 013 |
| 015 | [Decisão: nome do domínio e registro (Registro.br)](backlog/015-decisao-nome-dominio-registro.md) | Domínio e DNS | P0 | P | — |
| 016 | [Provedor de DNS, zona e plano de registros (hosts, TLS e redirecionamentos)](backlog/016-provedor-dns-zona-registros.md) | Domínio e DNS | P0 | P | 015 |
| 017 | [Atualizar configuração para os hosts definitivos (web, site, realtime e mobile)](backlog/017-atualizar-configuracao-hosts.md) | Domínio e DNS | P0 | M | 016 |
| 018 | [OIDC: URIs de redirecionamento Google e Apple e tela de consentimento](backlog/018-oidc-redirect-uris.md) | Domínio e DNS | P0 | P | 016 |
| 019 | [E-mail transacional e caixas da empresa (SPF, DKIM, DMARC)](backlog/019-email-transacional-spf-dkim-dmarc.md) | Domínio e DNS | P1 | M | 015, 016 |
| 020 | [Links das lojas e links universais (App Links e Universal Links)](backlog/020-links-lojas-app-links.md) | Domínio e DNS | P1 | M | 016, 043 |
| 021 | [Console da plataforma em host próprio e isolado](backlog/021-console-plataforma-host-separado.md) | Admin da plataforma | P0 | M | 016, 007 |
| 022 | [Equipe da plataforma: papéis, MFA e visualizador de auditoria](backlog/022-equipe-plataforma-papeis-mfa-auditoria.md) | Admin da plataforma | P0 | M | — |
| 023 | [Criar organização pela equipe e convidar o primeiro administrador](backlog/023-criar-organizacao-convidar-admin.md) | Admin da plataforma | P0 | M | 022 |
| 024 | [Usuários por organização e ações de acesso no console](backlog/024-usuarios-por-organizacao-acoes-acesso.md) | Admin da plataforma | P1 | M | 022 |
| 025 | [Decisão: acesso assistido (impersonação) com consentimento e auditoria](backlog/025-decisao-acesso-assistido.md) | Admin da plataforma | P1 | P | 022 |
| 026 | [Implementar acesso assistido com aprovação do cliente](backlog/026-implementar-acesso-assistido.md) | Admin da plataforma | P1 | G | 025, 021 |
| 027 | [Planos, limites e métricas de uso por organização](backlog/027-planos-limites-uso.md) | Admin da plataforma | P1 | M | 035, 022 |
| 028 | [Interruptores de módulos (Recursos) por organização e pela plataforma](backlog/028-interruptores-modulos-feature-flags.md) | Admin da plataforma | P1 | M | — |
| 029 | [Organização de demonstração com "Reiniciar demo"](backlog/029-organizacao-demo-reiniciar.md) | Admin da plataforma | P1 | M | — |
| 030 | [Solicitações LGPD: exportação e exclusão de dados (titular e organização)](backlog/030-solicitacoes-lgpd-exportacao-exclusao.md) | Admin da plataforma | P1 | G | 022, 042 |
| 031 | [Convite de usuário por e-mail](backlog/031-convite-por-email.md) | Gestão de usuários do tenant | P1 | M | 019 |
| 032 | [Sessões e aparelhos: revogar um celular sem desativar a pessoa](backlog/032-sessoes-dispositivos-revogar.md) | Gestão de usuários do tenant | P1 | M | — |
| 033 | [Políticas de acesso da organização (métodos de login, senha, duração de sessão)](backlog/033-politicas-acesso-organizacao.md) | Gestão de usuários do tenant | P2 | M | 032 |
| 034 | [Decisão: revisão de papéis e descoberta de SSO corporativo e SCIM](backlog/034-decisao-papeis-sso-scim.md) | Gestão de usuários do tenant | P2 | P | — |
| 035 | [Decisão: planos, preços e período de teste](backlog/035-decisao-planos-precos-trial.md) | Comercial e cobrança | P1 | P | — |
| 036 | [Decisão: provedor de cobrança (Pix, boleto, cartão) e emissão de NFS-e](backlog/036-decisao-provedor-cobranca-nfse.md) | Comercial e cobrança | P1 | M | 035 |
| 037 | [Integração de cobrança com o status da organização](backlog/037-integracao-cobranca-status-org.md) | Comercial e cobrança | P2 | G | 036, 027 |
| 038 | [Página de status e monitoramento de disponibilidade externo](backlog/038-pagina-status-uptime.md) | Operação e confiabilidade | P0 | P | 016 |
| 039 | [SLOs, processo de incidentes e plantão](backlog/039-slos-incidentes-plantao.md) | Operação e confiabilidade | P1 | P | 011, 038 |
| 040 | [Teste de carga em staging (sync, mídia e tempo real)](backlog/040-teste-de-carga.md) | Operação e confiabilidade | P1 | M | 010 |
| 041 | [Revisão de segurança e pentest externo](backlog/041-revisao-seguranca-pentest.md) | Operação e confiabilidade | P1 | M | 021 |
| 042 | [Revisão LGPD: política de privacidade, termos e DPA](backlog/042-revisao-lgpd-privacidade-dpa.md) | Operação e confiabilidade | P1 | M | — |
| 043 | [APK e AAB assinados com chave guardada em segredos](backlog/043-apk-aab-assinado.md) | Distribuição mobile | P0 | M | — |
| 044 | [Google Play: conta, ficha da loja e trilha de teste interno](backlog/044-google-play-teste-interno.md) | Distribuição mobile | P0 | M | 043, 016 |
| 045 | [Decisão: atualizações OTA (EAS Update) — custo, canais e política](backlog/045-decisao-atualizacoes-ota.md) | Distribuição mobile | P1 | P | — |
| 046 | [iOS: conta Apple, App Store Connect e TestFlight](backlog/046-ios-testflight.md) | Distribuição mobile | P2 | M | 016, 020, 042 |

## Ordem sugerida

1. **Decisões em paralelo (semana 1):**
   - 015 (nome do domínio);
   - 001 (provedor e cluster);
   - 002 (GitOps);
   - 003 (MongoDB e Redis), depois da 001;
   - 035 (planos);
   - 045 (OTA).
   A tarefa 042 (revisão LGPD) começa cedo porque influencia a residência de dados.
2. **Domínio no ar sobre a VM atual:**
   - 016 (DNS);
   - 017 (hosts);
   - 018 (OIDC);
   - 038 (página de status).
   O domínio definitivo pode entrar antes do Kubernetes, porque o Caddy da Fase 1 já emite TLS
   automaticamente.
3. **Base do cluster:**
   - 004 (clusters e namespaces);
   - 005 (imagem do site);
   - 008 (segredos);
   - 009 (driver S3);
   - 006 (Helm chart);
   - 007 (ingress, WebSocket e TLS).
4. **Entrega contínua e segurança operacional:**
   - 010 (pipeline GitOps);
   - 011 (observabilidade);
   - 012 (backups e restauração).
5. **Migração:** 013 (cutover da VM para o Kubernetes) e depois 014 (runbooks).
6. **Mobile em paralelo:** 043 (APK e AAB assinados), 044 (Google Play), 020 (App Links) e, mais
   tarde, 046 (iOS).
7. **Admin da plataforma:**
   - 022 (papéis, MFA e auditoria);
   - 021 (host separado);
   - 023 (criar organização);
   - 024 (usuários por organização);
   - 025 e 026 (acesso assistido);
   - 027 a 030 (planos, módulos, demo, LGPD).
8. **Usuários e cobrança:**
   - 019, 031 e 032 (e-mail, convite por e-mail, revogar aparelho);
   - 036 e 037 (provedor de cobrança e integração);
   - 033 e 034 (políticas de acesso; papéis, SSO e SCIM).
9. **Confiabilidade contínua:** 039 (SLOs e incidentes), 040 (teste de carga) e 041 (pentest),
   antes de clientes grandes.

O caminho crítico P0 é: **015 → 016 → 017 → (001 → 003, 002) → 004 → 006/007/008/009 → 010 →
012 → 013**.

## Documentos relacionados

- `docs/ARCHITECTURE.md` §11 (segurança e LGPD), §12 (observabilidade) e §18 (ambientes e deploy).
- `docs/RELEASING.md` e `docs/RUNBOOK.md`.
- `docs/plans/SIMPLER-TO-SELL.md` (roadmap comercial Now, Next, Later).
- `infra/aws/README.md` (referência da Fase 2 em ECS; o ADR-17 permite trocar a plataforma de
  contêineres).
