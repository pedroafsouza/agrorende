# Revisão LGPD: política de privacidade, termos e DPA

**ID:** 042 · **Épico:** Operação e confiabilidade · **Prioridade:** P1 · **Estimativa:** M

## Contexto

- A landing já tem as páginas `privacy` e `terms`, com conteúdo em `apps/landing/content/pt-br` e
  `apps/landing/content/en`, renderizado por `apps/landing/src/app/[locale]/[[...slug]]/page.tsx`.
- O contato de privacidade vem de `SITE_PRIVACY_EMAIL`. A versão dos termos é `TERMS_VERSION`
  (`2026-10-08`, segundo `docs/ARCHITECTURE.md` §18), aceita no cadastro.
- Pela §11, o cliente é controlador e a AgroRende é operadora. O app coleta localização de
  operadores em serviço, fotos e assinaturas.
- A mudança para Kubernetes pode envolver transferência internacional se o cluster ou backups
  ficarem fora do Brasil (tarefas 001, 003 e 012).

## Objetivo

Ter textos jurídicos revisados por profissional e um DPA (acordo de tratamento de dados) para
clientes, coerentes com a infraestrutura real.

## Escopo

### Incluído

- Inventário de dados pessoais e suboperadores (fornecedores):
  - nuvem;
  - Atlas;
  - Sentry;
  - e-mail;
  - cobrança;
  - EAS;
  - Google e Apple.
  Para cada um, registrar a região e a base legal.
- Revisão por advogado da política de privacidade e dos termos, com nova `TERMS_VERSION` e
  reaceite se necessário.
- Modelo de DPA para clientes, com lista pública de suboperadores na landing.
- Indicação de encarregado (DPO) e canal de contato.
- Verificar as regras atuais da ANPD sobre transferência internacional, confirmando o número e a
  vigência do regulamento.
- Registro de incidentes de segurança com dados pessoais e prazo de comunicação, ligado à
  tarefa 039.

### Fora do escopo

- Implementação técnica de exportação e exclusão (tarefa 030).

## Critérios de aceite

- [ ] Inventário de dados e suboperadores publicado internamente.
- [ ] Política e termos revisados publicados na landing em pt-BR e en.
- [ ] Modelo de DPA disponível para o time comercial.
- [ ] Decisão registrada sobre a residência de dados (Brasil ou exterior), alinhada com a
      tarefa 001.

## Notas técnicas

- Mudar `TERMS_VERSION` dispara reaceite no app. Combinar o momento com o suporte.

## Riscos

- Texto genérico que não reflete a operação real. Usar o inventário como base.

## Dependências

Nenhuma (alimenta 001, 030 e 039).
