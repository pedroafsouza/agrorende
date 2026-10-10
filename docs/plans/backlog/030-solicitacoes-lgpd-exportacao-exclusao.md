# Solicitações LGPD: exportação e exclusão de dados (titular e organização)

**ID:** 030 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** G

## Contexto

O que já existe (`docs/ARCHITECTURE.md` §11 "LGPD"):

- O cliente é controlador e a AgroRende é operadora.
- Exclusão de conta pelo próprio usuário em `(admin)/account` (PLT-21): anonimiza o usuário, limpa
  autenticação e aparelhos, apaga pings de localização e mantém registros de negócio atribuídos ao
  usuário anonimizado; Apple refresh token é revogado (`auth.appleRevoke`).
- Cancelamento da organização (`POST /org/cancel`) e purge após 90 dias (`orgs.purge`).
- Exportações CSV existem para custos (`exports.build` no worker).
- Não há fluxo para a organização exportar **todos** os seus dados, nem registro de solicitações de
  titulares recebidas pelo suporte.

## Objetivo

Atender pedidos de titulares e de clientes com rastreabilidade: exportação completa da
organização, exportação dos dados de um titular e exclusão, dentro dos prazos legais.

## Escopo

### Incluído

- Registro de solicitações no console (proposto `privacy_requests`): tipo (acesso, exportação,
  correção, exclusão), titular, organização, prazo, status, responsável, evidência.
- Exportação completa da organização (ADMIN no admin web e staff com motivo): ZIP com JSON/CSV por
  coleção e mídia, gerado no worker, link assinado com expiração.
- Exportação dos dados de um usuário (pedido via ADMIN do cliente, que é o controlador).
- Exclusão: reaproveitar a anonimização existente; exclusão da organização antecipada (antes dos
  90 dias) com confirmação dupla e auditoria.
- Prazos e modelos de resposta em pt-BR.

### Fora do escopo

- Textos jurídicos (tarefa 042).

## Critérios de aceite

- [ ] ADMIN baixa exportação completa da organização de staging; o arquivo abre e contém todas as
      coleções com `organizationId` da org e nenhuma de outra.
- [ ] Solicitação registrada mostra prazo e histórico.
- [ ] Exclusão antecipada remove dados e mídia e grava `org.purge` com motivo.
- [ ] Nenhum dado pessoal em logs `info` durante a exportação.

## Notas técnicas

- `packages/core` pode importar bibliotecas de arquivo apenas em `modules/exports/**` e `jobs/**`
  (exceções da §4).
- Exportação usa `scoped(ctx)`; teste cross-tenant obrigatório.

## Riscos

- Exportações grandes (mídia) pesam no worker; processar em fila com limites e streaming.

## Dependências

- 022, 042.
