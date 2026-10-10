# Usuários de demonstração

Os dados de demonstração vêm de [`packages/db/seed/index.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/db/seed/index.ts).
O seed é **determinístico** e seus horários são **relativos ao momento em que você roda o seed**,
então a demo sempre parece atual.

> **Senha de todas as contas do seed: `agrorende123`.** O `pnpm simulate` lê a variável
> `SEED_PASSWORD` caso você tenha trocado a senha. O seed recusa rodar com `APP_ENV=production`.

## Organização A — "AgroRende Demo Agro"

Organização ativa na região de Ribeirão Preto (SP), id `018fd000-0000-7000-8000-000000000001`.
É a organização usada em todas as demos.

| Email | Pessoa | Papel | Use para mostrar |
|---|---|---|---|
| `admin@agrorende.dev` | Ana Admin | ADMIN (Administrador) | Configurações, equipe, assinatura |
| `gerente@agrorende.dev` | Paulo Gerente | MANAGER (Gestor) | Relatórios e custos |
| `despacho@agrorende.dev` | Marina Despacho | MANAGER (Gestor) | Despacho e Central de Operações (`/ops`) |
| `inspetor@agrorende.dev` | Joana Inspetora | FIELD (Campo) | Registrar problemas (relatos) no app |
| `tecnico1@agrorende.dev` | Carlos Técnico | FIELD (Campo) | Ordens de serviço no app. Também vinculado ao subject do Google mock `mock-google-tecnico1`. Começa em serviço, com uma OS em espera (`WO-000011`, aguardando peças). |
| `tecnico2@agrorende.dev` | Pedro Técnico | FIELD (Campo) | Técnico simulado (`pnpm simulate`) |
| `tecnico3@agrorende.dev` | Lucas Técnico | FIELD (Campo) | Técnico simulado (`pnpm simulate`) |
| `locacao@agrorende.dev` | Rafael Locação | FIELD (Campo) | Entregas e devoluções de locação |
| `convite@agrorende.dev` | Bruno Convidado | FIELD (Campo) | Ainda não entrou. Código de convite `K7QM2XPA9F`, válido por 7 dias após o seed. |

## Organização B — "Fazenda Boa Vista"

Em período de teste (trial) que termina **5 dias depois do seed**. Conta: `admin@boavista.dev`
(Beatriz Boa Vista, ADMIN). Existe para provar que uma organização nunca vê os dados da outra
(isolamento de tenants).

## Console da plataforma (equipe AgroRende)

<http://localhost:3000/platform/login>. A equipe interna entra **somente com Google**. Localmente a
página mostra um campo "Google (mock) as…": digite `staff@agrorende.dev`, que está em
`PLATFORM_ADMIN_EMAILS` no [`.env.example`](https://github.com/pedroafsouza/agrorende/blob/main/.env.example).

## Login com Google e Apple (mock OIDC)

Os botões de Google e Apple vão para o provedor mock local na porta 4003
(`ghcr.io/navikt/mock-oauth2-server`). Na tela de login do mock, digite qualquer nome de usuário e,
na caixa de claims, um JSON como:

```json
{"email":"you@example.dev","email_verified":true,"name":"Your Name"}
```

O mock é só para desenvolvimento local e nunca é publicado.

## O selo "Demonstração"

Quando você entra na organização de demonstração, o cabeçalho do painel mostra o selo
**Demonstração** (em inglês, "Demo") com um ícone de frasco, e uma faixa que pode ser fechada:
"Você está no ambiente de demonstração. Os dados são fictícios."

- Código: [`apps/web/src/features/shell/demo.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/features/shell/demo.tsx)
  (`DEMO_ORG_ID`, `isDemoOrg`).
- Textos: chaves `admin.shell.demo.*` em `apps/web/messages/<idioma>/`.
- Para forçar o selo em qualquer organização (por exemplo, num staging de vendas), defina
  `NEXT_PUBLIC_DEMO_MODE=1`.

## O que o seed cria

Na organização A, entre outros dados:

- 9 locais (fazendas, pátios e a oficina) na região de Ribeirão Preto;
- 40 máquinas, de `AGR-000001` a `AGR-000040`;
- 3 modelos de checklist;
- 2 safras: "Safra 2026/27" e "Safrinha 2027";
- 10 clientes;
- 20 relatos, 15 ordens de serviço em todos os status e 8 locações;
- um dispositivo sem sincronizar há muito tempo, para o alerta de sync parado.

Pontos de apoio do roteiro de demo ([`docs/DEMO.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/DEMO.md)):

| Item | Valor |
|---|---|
| A máquina quebrada | `AGR-000012` "Trator JD 6110J #12", na Fazenda Santa Clara (Cravinhos), Talhão 2. Operacional, horímetro 4 298, sem relato nem OS no seed. |
| Ponto de partida do Carlos | Em serviço na Oficina Central Ribeirão Preto, com uma OS em espera (`WO-000011`). |
| Uma OS para o simulador | `WO-000002` no Pátio Sertãozinho, aberta. |
| Alertas já na tela | Locação `RN-000005` atrasada; `WO-000001` crítica e sem responsável. |

## Recriar os dados

| Comando | Quando usar |
|---|---|
| `pnpm db:reset` | Antes de cada demo: apaga o banco, migra, popula e gera as mídias. |
| `pnpm devloop --reset` | O mesmo, mantendo os volumes do Docker. Recusa em produção. |
| `pnpm db:seed --force` | Limpa e popula de novo sem rodar as migrações. |
| `pnpm simulate` | Movimenta os técnicos no mapa (veja [Comandos e scripts](Comandos-e-Scripts#tráfego-de-demonstração-pnpm-simulate)). |

Preparação recomendada pelo roteiro de demo:

```bash
pnpm db:reset
pnpm dev
pnpm simulate --users tecnico2@agrorende.dev,tecnico3@agrorende.dev,locacao@agrorende.dev   # segundo terminal
```

Deixe `tecnico1@agrorende.dev` (Carlos) fora do simulador: ele é usado no celular durante a demo.
O roteiro completo de 10 minutos, com falas e plano B, está em
[`docs/DEMO.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/DEMO.md).
