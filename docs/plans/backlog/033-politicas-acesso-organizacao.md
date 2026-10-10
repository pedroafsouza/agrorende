# Políticas de acesso da organização (métodos de login, senha, duração de sessão)

**ID:** 033 · **Épico:** Gestão de usuários do tenant · **Prioridade:** P2 · **Estimativa:** M

## Contexto

- Os usuários entram com senha, Google ou Apple. Os callbacks são
  `/api/v1/auth/oauth/google/callback` e `/api/v1/auth/oauth/apple/callback`, descritos em
  `docs/ARCHITECTURE.md` §11.
- As regras de senha e a duração dos tokens são globais. `OrgSettingsSchema`
  (`packages/contracts/src/settings.ts`) não tem nenhuma configuração de acesso.
- Clientes maiores (cooperativas, grupos) costumam pedir para restringir o login ao Google
  Workspace da empresa ou exigir senhas mais fortes.

## Objetivo

Dar ao ADMIN controles simples de política de acesso para a própria organização.

## Escopo

### Incluído

- Configuração proposta `access` em `OrgSettingsSchema`, que exige change request:
  - métodos permitidos (senha, Google, Apple);
  - domínio de e-mail obrigatório para o Google (opcional);
  - tamanho mínimo da senha (com piso global);
  - duração máxima da sessão no web;
  - inatividade máxima no celular.
- Tela em `(admin)/settings` → "Acesso".
- Aplicação das regras no login, na renovação de token e na troca de senha, com erros tratados.
- Proteção contra autobloqueio: a política não pode ser salva se deixar o ADMIN atual sem um
  método válido.

### Fora do escopo

- SAML e SCIM (tarefa 034).
- MFA para usuários do cliente (avaliar depois; a MFA da equipe da plataforma está na tarefa 022).

## Critérios de aceite

- [ ] Com "somente Google @empresa.com.br", o login por senha é recusado com mensagem clara e
      instrução.
- [ ] Usuários FIELD com sessão ativa não perdem trabalho offline quando a política muda; a nova
      regra vale na próxima renovação.
- [ ] O autobloqueio do ADMIN é impedido (teste).
- [ ] `pnpm check:only` e `pnpm i18n:check` verdes.

## Notas técnicas

- Encurtar a duração da sessão no celular é perigoso para quem trabalha offline. Manter um piso
  compatível com a janela offline descrita em `docs/ARCHITECTURE.md` §7.

## Riscos

- Políticas mal configuradas bloqueando a equipe de campo. Mitigação: pré-visualização mostrando
  quantos usuários seriam afetados.

## Dependências

- 032.
