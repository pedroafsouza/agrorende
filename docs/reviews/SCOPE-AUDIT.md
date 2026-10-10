# Auditoria de escopo: o que falta e o que sobra

Data: 2026-10-10. Base: `docs/PRD.md` (fonte normativa), `docs/DELIVERY-PLAN.md` §8 (cobertura de
requisitos), `docs/ERRORS.md`, `docs/plans/SIMPLER-TO-SELL.md`, `docs/plans/PLATAFORMA-BACKLOG.md`,
os 36 arquivos de `docs/progress/`, as change requests de `docs/change-requests/` e o código em
`apps/` e `packages/`.

## Como ler este relatório

- **Faltando**: requisito ou caso de erro do PRD que não existe no código ou que só existe como
  stub.
- **Parcial**: existe, mas falta estado de tela, fluxo de recuperação, teste ou parte do critério de
  aceite.
- **Excesso de escopo**: algo construído (ou planejado no backlog) que não está no MVP do PRD ou que
  vai além do necessário para o piloto descrito no PRD §14 (1 empresa, cerca de 30 usuários de
  campo).
- Prioridade:
  - **P0**: bloqueia a venda ou o piloto;
  - **P1**: importante logo depois;
  - **P2**: quando houver demanda.
- **Já rastreado** indica que existe issue no backlog. Os arquivos `docs/plans/backlog/NNN-*.md`
  viraram as issues #10 a #55. Este relatório assume a numeração em ordem, ou seja, issue = NNN + 9
  (001 → #10, 046 → #55). O `gh` desta máquina não conseguiu autenticar em github.com para
  confirmar os números, então vale conferir antes de citar uma issue.
- Verificação: todos os achados abaixo foram conferidos no código atual com `grep`/`ls`. Lacunas
  antigas dos arquivos de progresso que já foram resolvidas (OAuth Google/Apple, folha de QR,
  `assertOrganizationWritable`, SLA de janela crítica, feed ao vivo com chaves cruas, banners de
  status da organização, jobs `maintenance.dueScan`/`stock.lowScan`, `pnpm-lock.yaml`) foram
  descartadas e não aparecem aqui.

## Resumo executivo

O núcleo do MVP (relato offline, ordem de serviço, locação com vistoria e assinatura, central de
operações, tenancy, console da plataforma, site) está construído e coberto por testes. Só restam
dois stubs `notImplemented` em produção: a importação de CSV
(`apps/web/src/app/api/v1/imports/[entity]/route.ts:3`) e uma fachada morta no mobile
(`apps/mobile/src/features/sync-center/index.ts:4`). Nenhuma change request está aberta, exceto a
cosmética `docs/change-requests/ADMIN-CLEAN-001.md`.

Os problemas reais são de outra natureza:

1. Algumas peças P0 que **vendem** o produto não foram feitas. A mais grave: o técnico não consegue
   compartilhar o PDF pelo celular, que é o passo 6 do caminho principal (PRD §8).
2. Todo o pacote P1 da v1.1 (W6) foi entregue **antes** do piloto e aparece para todo cliente desde
   o primeiro dia. A flag `p1` existe em `apps/web/src/components/shell/nav.ts:53-65`, mas nada a
   usa para esconder itens.
3. O backlog de plataforma tem 14 issues de Kubernetes e um módulo de acesso assistido. Isso vai
   muito além da topologia da Fase 1 que o PRD §13 considera suficiente (até 200 organizações e
   3 000 usuários numa VM).

### As 10 ações de maior impacto para vender

| # | Ação | Por que vende | Tipo | Onde |
|---:|---|---|---|---|
| 1 | Compartilhar PDF da OS, da entrega e da devolução pelo celular (PLT-11), com **Copiar resumo** e **Salvar em arquivos** como alternativas (EC-PLT-30) | É o "momento WhatsApp" do caminho principal (PRD §8, passos 6 e 8) e a prova contra disputas, que é o job 2 do `SIMPLER-TO-SELL.md` §1. Hoje o mobile não chama `workOrderReportPdf`/`rentalCheckoutPdf`/`rentalCheckinPdf` (`packages/api-client/src/index.ts:247,265-266`) | Faltando P0, **nova issue** | `apps/mobile/src/features/jobs/`, `apps/mobile/src/features/rentals/` |
| 2 | Ligar os interruptores de módulos e esconder os módulos P1 por padrão | O cliente novo vê 21 itens de menu, incluindo Cobranças, Estoque e Manutenção. Isso contradiz o `SIMPLER-TO-SELL.md` §4 | Excesso de escopo, **já rastreado #37** (028) | `apps/web/src/components/shell/nav.ts` |
| 3 | Importação de planilha (máquinas, clientes, locais) com prévia e erros por linha | "Traga sua planilha" é a forma mais rápida de chegar ao primeiro valor. Hoje o menu leva a uma página placeholder (`apps/web/src/app/(admin)/imports/page.tsx`) e a API é stub | Faltando P0 (REC-14, EC-OPS-08/09/10), **nova issue** | `apps/web/src/features/imports/`, `packages/core/src/modules/*/import` |
| 4 | Gravar o vídeo de demonstração e as capturas de tela reais do site | A página Recursos mostra o fallback "em breve". Não existe `apps/landing/public/video/`, e os screenshots são desenhos (`docs/progress/T19.md`, `LANDING-SELL.md`) | Faltando P0 para vendas (SITE-01, SITE-08), **nova issue** | `apps/landing/public/video/`, `apps/landing/scripts/screenshots.ts` |
| 5 | Fechar as decisões comerciais e de lançamento: preço, domínio, revisão jurídica, APK assinado e Play Store | Sem preço, domínio e app instalável não há como fechar o primeiro contrato | **Já rastreado** #44 (035), #24 (015), #51 (042), #52 (043), #53 (044) | — |
| 6 | Importar foto ou vídeo da galeria na captura de evidências | É P0 no FR-03 e alternativa obrigatória quando a câmera é negada (REC-10). `expo-image-picker` está instalado (`apps/mobile/package.json:46`), mas nenhum arquivo o importa | Faltando P0, **nova issue** | `apps/mobile/src/components/MediaCapture/` |
| 7 | Enviar a telemetria `error_shown`/`error_recovered` do mobile e da web | Sem ela não há como provar as metas de autorrecuperação e de carga de suporte do PRD §4. O servidor grava (`packages/core/src/modules/devices/service.ts:170`), mas nenhum cliente chama `api.telemetry()` | Faltando P0 (REC-16), **nova issue** | `apps/mobile/src/ui/recovery/`, `apps/web/src/components/recovery/` |
| 8 | Rodar os fluxos Maestro e um teste com aparelho real antes do piloto, mais o teste de usabilidade SUS com 5 usuários | Os fluxos de `apps/mobile/.maestro/` nunca rodaram (`docs/progress/T17.md`). O PRD §11 exige SUS ≥ 80 antes da disponibilidade geral | Parcial P0, **nova issue** | `apps/mobile/.maestro/` |
| 9 | Seletor de talhão no relato (FR-02) | "Feito para o agro" e custo por talhão (ERP-03) dependem disso. O espelho local já tem `plotId` (`apps/mobile/src/db/mirror.generated.ts`), mas não há seletor; o T06 tratou o item como P1, contra o PRD | Faltando P0, **nova issue** | `apps/mobile/src/features/reports/ReportWizardScreen.tsx` |
| 10 | Adiar o épico Kubernetes (#10 a #23) e o acesso assistido (#34, #35) até haver gatilho real | Libera semanas de engenharia para os itens 1 a 9. A Fase 1 (`infra/vm/README.md`) atende o piloto, e o próprio `infra/aws/README.md` define os gatilhos da Fase 2 | Excesso de escopo, **já rastreado** | `docs/plans/backlog/001-014`, `025-026` |

## Tabela 1: Faltando

| ID / seção do PRD | Lacuna | Evidência | Onde deve ficar | Prioridade | Rastreado? |
|---|---|---|---|---|---|
| PLT-11, PLT-16, EC-PLT-30, PRD §8 passos 6 e 8 | O mobile não baixa nem compartilha os PDFs da OS, da entrega e da devolução, e não oferece Copiar resumo nem Salvar em arquivos | Sem uso de `workOrderReportPdf`/`rentalCheckoutPdf`/`rentalCheckinPdf` em `apps/mobile/src`; `Sharing.shareAsync` só aparece em `apps/mobile/src/features/sync/pendingWork.ts:39`; `PDF_SHARE_UNAVAILABLE` é declarado em `packages/contracts/src/errors.ts:151`, mas nenhuma tela o usa | `apps/mobile/src/features/jobs/JobCompleteScreen.tsx`, `apps/mobile/src/features/rentals/RentalDetailScreen.tsx` | P0 | Não |
| REC-14, EC-OPS-08/09/10 | Importação de CSV: a API é `notImplemented` e a página é placeholder, mas aparece no menu para ADMIN | `apps/web/src/app/api/v1/imports/[entity]/route.ts:3`, `apps/web/src/app/(admin)/imports/page.tsx`, `nav.ts:68`; só existe `apps/web/src/features/imports/shared` | `apps/web/src/features/imports/`, `packages/core/src/modules/{assets,customers,sites}` | P0 | Não (o "Later" do SIMPLER-TO-SELL cita um assistente de planilha, mas não há issue) |
| FR-03, REC-10 | Importar da galeria não existe; sem câmera, a alternativa "galeria" não funciona | `expo-image-picker` e `expo-document-picker` estão em `apps/mobile/package.json:41,46`, sem nenhum import em `apps/mobile/src` | `apps/mobile/src/components/MediaCapture/index.tsx` | P0 | Não |
| REC-16 | Telemetria de erro não é enviada pelos clientes | `ApiClient.telemetry` em `packages/api-client/src/index.ts:111` não tem chamadores; o servidor recebe em `packages/core/src/modules/devices/service.ts:170` | Kits de recuperação: `apps/mobile/src/ui/recovery/useRecovery.ts` e `apps/web/src/components/recovery/` | P0 | Não |
| FR-02, ERP-01, EC-FR-11 | Sem seletor de talhão (e sem "Continuar sem talhão") no assistente de relato | Nenhuma ocorrência de `plot` em `apps/mobile/src/features/reports` nem em `apps/mobile/src/components`; `docs/progress/T06.md` (Gaps) | `apps/mobile/src/features/reports/` | P0 | Não |
| FR-09 | Depois do envio não há "Adicionar outro para esta máquina"; o app vai direto ao detalhe | `apps/mobile/src/features/reports/ReportWizardScreen.tsx:88` (`router.replace`); não existe chave i18n equivalente em `apps/mobile/src/i18n/pt-BR/reports.json` | `ReportWizardScreen.tsx` | P0 (baixo esforço) | Não |
| WO-05 | "Salvar este ponto" ao chegar não existe, nem a mutação nos contratos; "Copiar direções" também não aparece quando o destino é inválido | Nenhuma ocorrência de `savePoint`/`point` em `packages/contracts/src/mutations/`; `apps/mobile/src/lib/navigation.ts:18` só lança `NAV_DESTINATION_DOUBTFUL` | `packages/contracts/src/mutations/workOrders.ts` (CR) e `apps/mobile/src/features/jobs/` | P0 | Não |
| PLT-05 (AC) | O leitor de QR não tem lanterna; a alternativa de digitar o código existe | `apps/mobile/src/features/assets/ScanView.tsx` sem `enableTorch` | `ScanView.tsx` | P0 (baixo esforço) | Não |
| NFR "Devices", EC-OPS-15 | A web não bloqueia navegadores sem suporte com a página de atualização | Nenhuma ocorrência de `UNSUPPORTED_BROWSER` em `apps/web/src` (código declarado em `packages/contracts/src/errors.ts:203`); `docs/progress/T11.md` | `apps/web/src/app/layout.tsx` ou middleware | P1 | Não |
| EC-PLT-14, OFF-10 | `DEVICE_STORAGE_FULL` nunca é lançado; existe só o bloqueio de captura `MEDIA_DEVICE_STORAGE_LOW` e não há aviso global abaixo de 1 GB | `apps/mobile/src/media/capture.ts:40`, `apps/mobile/src/media/storage.ts:3`; nenhuma ocorrência de `DEVICE_STORAGE_FULL` fora de `packages/contracts` | Banner em `apps/mobile/src/features/home/TodayScreen.tsx` | P1 | Não |
| UX-13, REC-14 | Não há ações em massa em nenhuma lista; `BulkResultDialog` existe, mas não é usado | Só `apps/web/src/components/recovery/BulkResultDialog.tsx`, sem importadores; `docs/progress/T11.md` | Listas de OS, relatos e máquinas em `apps/web/src/features/` | P1 | Não |
| ERP-08 vs. PRD §4 | (Observação) O módulo de cobranças tem `pay`, mas o PRD deixa pagamento fora do MVP. Não falta nada aqui: ver Tabela 3 | `apps/web/src/app/api/v1/billing-documents/[id]/pay` | — | — | — |
| Lançamento | Domínio, DNS, OIDC, e-mail, links das lojas | `docs/plans/backlog/015-020` | — | P0/P1 | **Sim**, #24 a #29 |
| Lançamento | APK/AAB assinado, Play teste interno, OTA, iOS | `docs/plans/backlog/043-046` | — | P0/P1/P2 | **Sim**, #52 a #55 |
| SITE-06/11 | Revisão jurídica de privacidade, termos e DPA | `apps/landing/messages/pt-BR/site.json:258` ("Revisão jurídica pendente.") | — | P0 | **Sim**, #51 (042) |
| TEN-08 | Pagamento online e limites de plano | `docs/plans/backlog/035-037`, `027` | — | P1 | **Sim**, #44 a #46 e #36 |

## Tabela 2: Parcial

| ID / seção do PRD | O que existe | O que falta | Evidência | Prioridade | Rastreado? |
|---|---|---|---|---|---|
| PRD §11 "Validation", UX-14, OFF-10 | 9 fluxos Maestro escritos e uma suíte de caos no CI (`.github/workflows/ci.yml:86-120`) | Nunca rodaram em emulador ou aparelho; também não houve SUS, nem medição de abertura em menos de 2 s num Moto G | `apps/mobile/.maestro/*.yaml`, `docs/progress/T17.md` (Gaps), `docs/progress/MOTION.md` | P0 | Não |
| OPS-07 | Formulário de local com latitude, longitude e raio digitados | Falta o seletor no mapa, que é P0. O desenho de contorno do talhão, que é P1, foi feito (`BoundaryDrawMap.tsx`): prioridade invertida | `apps/web/src/features/sites/SiteForm.tsx:20,66,91`, `docs/progress/T11.md` | P1 | Não |
| EC-OPS-26 | O fuso da organização é usado no SLA (`packages/core/src/modules/workOrders/service.ts:223`) | A tela de configurações não permite editar o fuso | Nenhuma ocorrência de `timeZone` em `apps/web/src/features/settings/*.tsx` | P1 | Não |
| REC-12, EC-PLT-42 ("Salvar cópia") | Exporta o manifesto JSON das pendências | Não inclui os arquivos de mídia; o EC-SYN-31 (`SAME_USER_MULTIPLE_DEVICES`) nunca aparece porque falta a fonte no servidor | `apps/mobile/src/features/sync/pendingWork.ts:38`, `docs/progress/W5-gate.md`, `docs/change-requests/T12-002.md` (APPLIED-PARTIAL) | P1 | Não |
| EC-PLT-17 | Banner de relógio errado | Só aparece no Sync Center, não no Hoje nem na captura | `apps/mobile/src/features/sync/SyncCenterScreen.tsx:104` | P2 | Não |
| FR-03, OFF-08 | Vídeo e voz gravam e enviam | As miniaturas de vídeo não têm pôster (falta `expo-video-thumbnails`) | `docs/progress/T03.md` (Gaps) | P2 | Não |
| UX-05 | O ditado do teclado funciona | Não há ditado próprio no campo de descrição | `docs/progress/T06.md` | P2 | Não |
| Testes web | 56 arquivos de teste em `apps/web/src` | Não há testes de rota HTTP por papel para todas as rotas (AC do T02, T09.8) | `docs/progress/T02.md`, `docs/progress/T09.md` | P1 | Não |
| Testes mobile | 41 arquivos de teste | A UI do check-in completo e os banners EC-RN-19/20 não são testados | `docs/progress/T08.md` | P1 | Não |
| Motion, `SIMPLER-TO-SELL.md` §6 | Lottie no site, no admin e no mobile | As animações em loop não pausam fora da tela, e o contraste no tema escuro não foi verificado | `docs/progress/MOBILE-SELL.md`, `docs/progress/MOTION.md` | P2 | Não |
| Estados de tela | `loading.tsx` por grupo | `notifications` e `getting-started` usam o esqueleto genérico | `docs/progress/PAGE-MOTION.md` | P2 | Não |
| Texto i18n | Contorno em `notificationDisplay.ts` | Códigos unidos com "·" nas notificações, nos cards da OS e nos custos | `docs/change-requests/ADMIN-CLEAN-001.md` (OPEN) | P2 | Não (CR aberta) |
| Observabilidade | Sentry no mobile | Sem Sentry na web, no realtime e no worker | `docs/progress/DEV-WIKI.md`; `apps/web/package.json` sem `@sentry` | P1 | **Sim**, #20 (011) |
| Código morto | — | `apps/mobile/src/features/sync-center/index.ts` (stub `notImplemented`, a tela real está em `features/sync`); `features/tenancy/GettingStartedCard.tsx` e as chaves `tenancy.gettingStarted.*` sem uso | `docs/progress/ADMIN-SELL.md` | P2 | Não |

## Tabela 3: Excesso de escopo

| Item | Por que é excesso | Evidência | Custo de manter | Recomendação |
|---|---|---|---|---|
| Módulos P1 da v1.1 entregues antes do piloto: cobranças (ERP-08), peças e estoque (ERP-05), manutenção preventiva (ERP-06), combustível (ERP-07), análises (OPS-06), ⌘K (OPS-08), comentários (PLT-10), central de notificações (PLT-08), anotação (FR-04), mapa de serviços (WO-02), prompt de chegada (WO-06), contorno de talhão e satélite | O PRD §14 coloca tudo na v1.1, depois do piloto. Foram planejados no W6, mas aparecem para todo cliente no primeiro dia e não há interruptor | `nav.ts:53-65` (flag `p1` não usada); cerca de 3 300 linhas em `apps/web/src/features/{billing,fuel,parts,maintenance,analytics,command-palette,comments,notifications}` e 2 200 linhas em `packages/core/src/modules/{billing,fuel,parts,maintenance,comments}` | Mais superfície para testar, traduzir e dar suporte; o primeiro uso fica confuso; o sync do mobile ganha espelhos de estoque e combustível com casos de borda (`docs/progress/T14.md`) | **Esconder atrás de flag** (#37) com os padrões do `SIMPLER-TO-SELL.md` §4. Manter o código. Não investir mais nesses módulos até o piloto validar o núcleo |
| Cobranças com `issue`/`pay`/PDF | O PRD §4 deixa pagamentos e livro contábil fora do MVP; o ERP-08 é um "pré-faturamento" P1. Marcar como pago aproxima o produto de um contas a receber | `apps/web/src/app/api/v1/billing-documents/[id]/{issue,pay,pdf}` | Expectativa errada de financeiro no cliente, mais revisão fiscal (NF-e) | **Esconder** até a decisão de cobrança (#45). Rever o rótulo "pago" para "liquidado fora do AgroRende" |
| Pacote `@agrorende/motion` (gerador de Lottie em TypeScript, 15 animações, cerca de 1 900 linhas) e dois players (`lottie-web` e `lottie-react-native`) | Não está no PRD; veio do `SIMPLER-TO-SELL.md` §6. Pode pesar no UX-14 (Home em menos de 2 s) e no orçamento Lighthouse do SITE-05 | `packages/motion/src/animations/*.ts`, `apps/mobile/package.json:61-62` | Mais dependências nativas, tamanho do bundle, manutenção de um gerador próprio; `parts.ts` não tem JSON gerado (`docs/progress/DEV-WIKI.md`) | **Manter, mas simplificar**: limitar ao site, aos estados vazios e às confirmações; medir o bundle e o tempo de abertura antes do piloto |
| Épico Kubernetes, 14 issues (001 a 014) e a lista de recursos AWS da Fase 2 | O PRD §13 diz que a Fase 1 aguenta 200 organizações e 3 000 usuários; o piloto é 1 empresa. O próprio `infra/aws/README.md` define os gatilhos da Fase 2 | `docs/plans/backlog/001-014`, `infra/aws/README.md`, `infra/vm/README.md` | Semanas de engenharia, custo mensal de cluster e mais uma pilha para operar (Helm, GitOps, ESO) | **Adiar**: #10 a #23. Exceções: o driver S3 (#18) se o disco da VM virar limite, e o exercício de restauração (#21) adaptado à VM |
| Acesso assistido / impersonação (025, 026) | Contradiz o PRD §13 Security: "platform staff have no access to tenant business data" (também TEN-06) | `docs/plans/backlog/025-decisao-acesso-assistido.md`, `026-...` | Risco LGPD e de segurança, pentest maior | **Remover do plano** ou exigir mudança explícita no PRD antes: #34, #35 |
| Console da plataforma em host separado, papéis e MFA da equipe, criação de organização pela equipe (021 a 024) | O TEN-06 pede só status, plano, trial e link de reset; o cadastro é self-service (TEN-01) | `docs/plans/backlog/021-024` | Moderado | **Simplificar**: manter MFA e auditoria (#31); adiar host separado (#30) e criação assistida (#32) até ter equipe de vendas |
| Dois pipelines de build Android: `android-apk.yml` (APK direto) e `mobile.yml` (EAS) | Duplicam o mesmo resultado; o EAS ainda depende de passo humano (`docs/progress/W5-gate.md`) | `.github/workflows/android-apk.yml`, `.github/workflows/mobile.yml` | Duas fontes de verdade para versão e assinatura | **Escolher um** na decisão de OTA (#54) e no APK assinado (#52) |
| Wiki do desenvolvedor (`docs/wiki/`) | Duplica o README, a ARCHITECTURE e o RUNBOOK; ainda não foi publicada | `docs/wiki/*.md`, `docs/progress/DEV-WIKI.md` | Documentação divergente com o tempo | **Manter enxuta** ou gerar a partir dos documentos normativos |
| Assets não usados do site | `Picture.tsx` e as imagens de herói e de recursos ficaram sem uso | `docs/progress/LANDING-SELL.md` | Baixo | **Remover** na próxima limpeza (manter só o que alimenta o Open Graph) |
| Simulador de operadores (`apps/worker/src/simulate.ts`, cerca de 700 linhas) | Está no plano (T13) e é útil para demo | — | Baixo | **Manter**; é peça do kit de vendas (`SIMPLER-TO-SELL.md` §7) |

Itens analisados e **não** considerados excesso: console da plataforma básico (TEN-06 é P0), as 188
páginas de ajuda por código de erro (REC-15 é P0), os guias de estilo de desenvolvimento (exigidos
pelo kit de agentes) e o guia de primeiro uso (`apps/web/src/features/onboarding`, que atende o
TEN-10).

## Já rastreado no backlog (#10 a #55): não duplicar

| Tema | Issues |
|---|---|
| Kubernetes, imagens, Helm, ingress, segredos, S3, CI/GitOps, observabilidade, backups, migração, runbooks | #10 a #23 |
| Domínio, DNS, hosts, OIDC, e-mail, App Links | #24 a #29 |
| Console da plataforma, MFA, criação de organização, acesso assistido, planos e limites, **interruptores de módulos (#37)**, **organização demo (#38)**, LGPD | #30 a #39 |
| Convite por e-mail, sessões e aparelhos, políticas de acesso, SSO/SCIM | #40 a #43 |
| Preço e trial, provedor de cobrança e NFS-e, integração de cobrança | #44 a #46 |
| Página de status, SLOs, teste de carga, pentest, revisão LGPD | #47 a #51 |
| APK/AAB assinado, Play teste interno, OTA, iOS TestFlight | #52 a #55 |

## Novas issues sugeridas (fora de #10 a #55)

1. **Compartilhar PDF da OS e da locação pelo celular (PLT-11)** — P0
   Baixar `report.pdf`, `checkout.pdf` e `checkin.pdf` no idioma do documento e abrir a folha nativa
   de compartilhamento. Sem conexão, explicar; sem destino, oferecer Copiar resumo e Salvar em
   arquivos (EC-PLT-30).

2. **Importação de planilha para máquinas, clientes e locais (REC-14)** — P0
   Substituir o stub de `POST /api/v1/imports/:entity` e a página placeholder por upload, prévia
   (dry-run), erros por linha com CSV para baixar e confirmação. Cobre EC-OPS-08, 09 e 10.

3. **Vídeo de demonstração e capturas reais no site** — P0
   Gravar o vídeo narrado de cerca de 10 minutos e o corte curto, colocá-los em
   `apps/landing/public/video/` e gerar capturas reais com `apps/landing/scripts/screenshots.ts`.
   Hoje Recursos mostra "em breve".

4. **Importar evidências da galeria (FR-03, REC-10)** — P0
   Ligar `expo-image-picker` ao `MediaCapture`, preservando o carimbo de hora e o motivo da
   ausência de GPS. É também a alternativa quando a câmera é negada.

5. **Telemetria de erro nos clientes (REC-16)** — P0
   Enviar `error_shown` e `error_recovered`, sem dados pessoais, a partir dos kits de recuperação
   do mobile e da web. Sem isso as metas de autorrecuperação do PRD §4 não podem ser medidas.

6. **Seletor de talhão no relato (FR-02, EC-FR-11)** — P0
   Mostrar talhões opcionais quando o local for fazenda, com "Continuar sem talhão". O espelho já
   tem `plotId`; falta a interface.

7. **Validação de campo antes do piloto: Maestro, aparelho real e SUS** — P0
   Rodar os 9 fluxos de `apps/mobile/.maestro/` num emulador Android, medir a abertura num aparelho
   de entrada (UX-14) e fazer o teste de usabilidade com 5 usuários por persona (PRD §11).

8. **Pequenos itens P0 do campo: "Adicionar outro", lanterna e "Salvar este ponto"** — P0
   Incluir "Adicionar outro para esta máquina" após o envio (FR-09), a lanterna no leitor de QR
   (PLT-05) e o salvar ponto com "Copiar direções" no fluxo de navegação (WO-05). A última parte
   precisa de change request em `packages/contracts`.

9. **Seletor de ponto no mapa para locais (OPS-07)** — P1
   Trocar os campos numéricos de latitude e longitude do `SiteForm` por clique ou arraste no mapa
   MapLibre já usado no contorno de talhão.

10. **Ações em massa nas listas do escritório (UX-13)** — P1
    Seleção múltipla em OS, relatos e máquinas (atribuir, cancelar, arquivar), usando o
    `BulkResultDialog` já pronto, com "Tentar de novo as falhas" (EC-OPS-07).

11. **Bloqueio de navegador sem suporte e fuso editável** — P1
    Página de atualização do navegador (EC-OPS-15) e campo de fuso nas configurações, com validação
    (EC-OPS-26).

12. **Armazenamento cheio e "Salvar cópia" com mídia** — P1
    Banner global abaixo de 1 GB com `DEVICE_STORAGE_FULL` (EC-PLT-14, OFF-10) e exportação em ZIP
    com os arquivos de mídia, não só o manifesto.

13. **Limpeza de código morto e de assets do site** — P2
    Remover `apps/mobile/src/features/sync-center/index.ts`, `GettingStartedCard` com as chaves
    `tenancy.gettingStarted.*` e `Picture.tsx` com as imagens antigas do site. Aplicar a
    `ADMIN-CLEAN-001`.
