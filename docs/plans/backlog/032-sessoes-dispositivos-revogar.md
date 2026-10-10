# Sessões e aparelhos: revogar um celular sem desativar a pessoa

**ID:** 032 · **Épico:** Gestão de usuários do tenant · **Prioridade:** P1 · **Estimativa:** M

## Contexto

- `docs/RUNBOOK.md` §11 descreve o caso de celular perdido ou roubado. Hoje a única saída é
  **Desativar** a pessoa em `/team/[id]`, o que encerra a sessão em todos os aparelhos e revoga
  todos os tokens. Depois é preciso **Reativar** e enviar um link de senha.
- Os aparelhos aparecem em `/team/devices`, com as rotas `/users/:id/devices` e `/devices`.
- O `RefreshToken` já guarda `deviceId`. A revogação está em `packages/core/src/auth/tokens.ts` e
  `packages/core/src/auth/service.ts`, que usam o campo `revokedAt`. Portanto a revogação por
  aparelho é tecnicamente viável.
- Depois da desativação, o aparelho perdido ainda pode enviar, por 72 horas, as evidências que já
  tinha capturado.

## Objetivo

Permitir que o ADMIN encerre a sessão de um único aparelho, e que o próprio usuário veja e
encerre suas sessões, sem desativar a conta.

## Escopo

### Incluído

- Ação "Encerrar sessão neste aparelho" em `/team/[id]` e em `/team/devices`. A ação revoga os
  `RefreshToken` daquele `deviceId` e marca o aparelho como revogado.
- Em `(admin)/account`, uma lista "Minhas sessões" (web e celulares) com a opção "Sair deste
  aparelho".
- O aparelho revogado mantém a mesma janela de 72 horas para enviar as evidências já capturadas,
  igual à desativação.
- Registro de auditoria da ação (quem, quando, aparelho) no log da organização.
- Atualizar `docs/RUNBOOK.md` §11 e `docs/SUPPORT.md` (change request se o dono for outro).

### Fora do escopo

- Apagar dados do aparelho remotamente.
- MDM (gestão corporativa de aparelhos).

## Critérios de aceite

- [ ] Revogar o aparelho A não afeta a sessão do aparelho B do mesmo usuário (teste).
- [ ] O aparelho revogado recebe 401 na próxima renovação e mostra uma tela de login clara, sem
      perder o trabalho pendente.
- [ ] As evidências pendentes enviadas dentro de 72 horas são aceitas; depois disso, são recusadas
      com o erro documentado.
- [ ] Um MANAGER ou FIELD não consegue revogar o aparelho de outra pessoa (teste de RBAC).
- [ ] `pnpm check:only` e `pnpm i18n:check` verdes.

## Notas técnicas

- Reaproveitar o caminho de "evidência após desativação" para não criar uma segunda regra de 72 horas.
- O socket em tempo real do aparelho revogado deve ser desconectado (evento ou checagem no
  `apps/realtime`).

## Riscos

- Revogar sem querer o aparelho ainda em uso. Mitigação: confirmar mostrando o nome do aparelho e a
  data do último sync.

## Dependências

Nenhuma.
