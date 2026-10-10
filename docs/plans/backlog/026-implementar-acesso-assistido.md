# Implementar acesso assistido com aprovação do cliente

**ID:** 026 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** G

## Contexto

Depende da decisão da tarefa 025. O admin web autentica com cookies `ar_access` (path `/`) e
`ar_refresh` (path `/api/v1/auth`), e `src/proxy.ts` renova a sessão (§11). O access JWT tem claims
`{sub, org, role, sev}`. O console da plataforma usa `ar_platform` em outro host (tarefa 021).
Atividade de negócio é registrada em `ActivityEvent` (§11 "Audit") e o feed aparece em
`GET /ops/activity`.

## Objetivo

Entregar o fluxo escolhido: pedido do staff, aprovação do ADMIN, sessão limitada e auditada.

## Escopo

### Incluído

- Pedido no console: `POST /api/v1/platform/orgs/:id/assist-requests {reason, mode, minutes}`
  (nome proposto).
- Aprovação no admin do cliente: notificação ao ADMIN e tela de aprovar/recusar.
- Emissão de sessão assistida no host do cliente com claim de ator (decisão 025), sem refresh,
  expiração ≤ 60 min, banner fixo e botão "Encerrar acesso".
- Marcação em cada `ActivityEvent` gerado na sessão e eventos `support.assist.started/ended`
  visíveis no feed do cliente.
- Bloqueios: rotas de usuários, cobrança, assinatura, exclusão e exportação.
- Testes: sem aprovação → `FORBIDDEN`; expirada → `UNAUTHENTICATED` com tela de recuperação.

### Fora do escopo

- Acesso assistido ao app móvel.

## Critérios de aceite

- [ ] Fluxo completo demonstrado em staging com dois navegadores (staff e cliente).
- [ ] Cliente vê no feed quem acessou, quando e por quê.
- [ ] Sessão encerra sozinha no tempo definido.
- [ ] Testes de matriz e cross-tenant verdes.
- [ ] Strings em pt-BR e en.

## Notas técnicas

- Novos eventos, claims, rotas e coleções exigem change requests para ARCHITECTURE §5, §8 e §11 e
  para `packages/contracts`/`packages/db` (congelados pela R4).

## Riscos

- Escalada de privilégio se o claim de ator não for verificado em todas as rotas; centralizar no
  `withApi`.

## Dependências

- 025, 021.
