# Decisão: provedor de cobrança (Pix, boleto, cartão) e emissão de NFS-e

**ID:** 036 · **Épico:** Comercial e cobrança · **Prioridade:** P1 · **Estimativa:** M · **Tipo:** decisão

## Contexto

- Não existe integração de pagamento. A tela `(admin)/settings/subscription` mostra plano, status
  e uso (`GET /org/subscription`), e a equipe muda o status manualmente pelo console.
- O roadmap "Later" de `docs/plans/SIMPLER-TO-SELL.md` §8 lista pagamentos por Pix e boleto e a
  emissão de notas.
- Venda de software como serviço (SaaS) normalmente é tributada pelo ISS e exige **NFS-e**
  (nota de serviço municipal), não NF-e. Confirmar com a contabilidade, incluindo o regime
  tributário da empresa.

## Objetivo

Escolher o provedor de cobrança recorrente e a forma de emitir notas fiscais, com custos e
esforço de integração comparados.

## Escopo

### Incluído

- Comparar pelo menos três provedores com atuação no Brasil (por exemplo Asaas, Iugu, Pagar.me,
  Stripe Brasil, Mercado Pago). Para cada um, levantar:
  - Pix recorrente ou cobrança Pix, boleto e cartão;
  - taxas;
  - assinaturas com quantidade variável;
  - webhooks;
  - sandbox;
  - emissão de NFS-e integrada ou por parceiro;
  - prazos de repasse;
  - exigências de cadastro (CNPJ).
- Decidir se a NFS-e sai do provedor de cobrança ou de um emissor separado (por exemplo NFE.io,
  eNotas, Focus NFe).
- Fluxo proposto: cliente informa CNPJ ou CPF e endereço de cobrança, assina, paga, recebe a nota;
  inadimplência leva a `PAST_DUE`.
- Dados mínimos de cobrança a guardar e onde (LGPD; não guardar cartão).

### Fora do escopo

- Implementação (tarefa 037).

## Critérios de aceite

- [ ] Documento de decisão com tabela comparativa, custo estimado para 50 e 200 organizações, e
      recomendação.
- [ ] Confirmação da contabilidade sobre NFS-e, código de serviço e município.
- [ ] Conta sandbox criada no provedor escolhido. Credenciais ficam fora do repositório.

## Notas técnicas

- O webhook do provedor deve ser idempotente e assinado. Prever a rota proposta
  `POST /api/v1/billing/webhook` (change request para `docs/ARCHITECTURE.md` §8).

## Riscos

- Troca de provedor depois é cara. Preferir provedor com exportação de assinaturas.

## Dependências

- 035.
