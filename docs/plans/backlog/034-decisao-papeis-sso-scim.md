# Decisão: revisão de papéis e descoberta de SSO corporativo e SCIM

**ID:** 034 · **Épico:** Gestão de usuários do tenant · **Prioridade:** P2 · **Estimativa:** P · **Tipo:** decisão

## Contexto

- Os papéis são exatamente `ADMIN`, `MANAGER` e `FIELD` (`docs/ARCHITECTURE.md` §11). A matriz de
  permissões vive no core, e o guarda `LAST_ADMIN` impede remover o último ADMIN.
- Não existe papel somente leitura (por exemplo, para contador ou dono que só consulta), nem papel
  restrito por fazenda ou unidade.
- Não há SSO corporativo (SAML/OIDC genérico) nem provisionamento automático (SCIM).

## Objetivo

Decidir, com base em conversas com clientes, se e quando criar novos papéis, SSO corporativo e
SCIM, e registrar a decisão.

## Escopo

### Incluído

- Entrevistar de três a cinco clientes ou prospects e levantar as necessidades reais de papéis
  (somente leitura, financeiro, por unidade).
- Levantar o custo de implementar SAML/OIDC genérico (biblioteca versus provedor gerenciado) e
  SCIM 2.0.
- Recomendação documentada: o que fazer agora, o que fazer depois e o que não fazer. Para cada
  mudança de modelo, indicar o impacto em `packages/contracts` e no sync do celular.

### Fora do escopo

- Implementação.

## Critérios de aceite

- [ ] Documento de decisão em `docs/plans/` com as necessidades levantadas e a recomendação.
- [ ] Se aprovado, tarefas de implementação criadas com estimativa.

## Notas técnicas

- Um papel novo muda o filtro de sync e a matriz de permissões. Avaliar o efeito em
  `scoped(ctx)` e no download por papel.

## Riscos

- Complexidade de papéis sem demanda real. A pesquisa existe para evitar isso.

## Dependências

Nenhuma.
