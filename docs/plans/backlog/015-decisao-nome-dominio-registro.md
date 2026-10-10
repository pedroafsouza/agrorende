# Decisão: nome do domínio e registro (Registro.br)

**ID:** 015 · **Épico:** Domínio e DNS · **Prioridade:** P0 · **Estimativa:** P · **Tipo:** decisão

## Contexto

Todo o projeto usa `agrorende.com.br` como **placeholder** "até os domínios serem registrados"
(`docs/ARCHITECTURE.md` §18.3): `SITE_HOST=agrorende.com.br`, `APP_HOST=app.agrorende.com.br`,
`WS_HOST=ws.agrorende.com.br`, staging em `staging.`, `app.staging.` e `ws.staging.`. O mesmo nome
aparece em `infra/caddy/Caddyfile` (padrões e `ACME_EMAIL` `ops@agrorende.com.br`),
`infra/vm/README.md`, `infra/aws/README.md`, `docs/RELEASING.md` e nos padrões de
`.github/workflows/android-apk.yml`. Os identificadores do app (`app.agrorende.field`, esquema
`agrorende`) estão em `apps/mobile/app.config.ts` e não dependem do domínio, mas devem combinar com
a marca.

## Objetivo

Escolher e registrar o domínio principal e os defensivos, em nome da pessoa jurídica correta, com
renovação automática.

## Escopo

### Incluído

- Verificar disponibilidade de `agrorende.com.br`, `agrorende.com`, `agrorende.app` e variações
  (ex.: `agro-rende`), e conflito de marca no INPI.
- Registrar o `.com.br` no Registro.br (exige titular com CPF ou CNPJ — confirmar as regras atuais
  para `.com.br`; preferir o CNPJ da empresa) e o `.com` defensivo em registrador com 2FA.
- Contatos administrativo/técnico/cobrança com e-mail de grupo (não pessoal).
- Renovação automática por vários anos, 2FA na conta do registrador, cofre com as credenciais.
- Registrar a decisão e abrir change request para atualizar o placeholder em
  `docs/ARCHITECTURE.md` §18.3 se o nome mudar.

### Fora do escopo

- Zona DNS (tarefa 016).

## Critérios de aceite

- [ ] Domínio principal e defensivos registrados, titular = CNPJ da empresa.
- [ ] Renovação automática ativa; vencimento em calendário de operações.
- [ ] 2FA ativo nas contas de registro; acesso de pelo menos duas pessoas.
- [ ] Decisão registrada com alternativas consideradas.

## Notas técnicas

- Se o nome final não for `agrorende.com.br`, listar todos os arquivos que precisam mudar (ver
  tarefa 017) antes de executar.

## Riscos

- Perda do domínio por expiração ou conta pessoal de ex-colaborador.
- Conflito de marca descoberto depois do lançamento.

## Dependências

Nenhuma.
