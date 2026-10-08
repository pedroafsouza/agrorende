# AgroRende: Competitive landscape (Brazil)

> No Brazilian product combines AgroRende's field report, repair, rental and cost loop, offline-first and multi-brand.

| | |
|---|---|
| Status | v1.1, research snapshot + small-farm segment (round 5) |
| Date | 2026-10-08 |
| Sources | public vendor sites, review portals, press; no vendor demos yet |
| Audience | product owner, sales; **agents don't need this document to build** |

## 1. Summary

No Brazilian product combines the whole loop: field report → repair WO → rental check-out/check-in with damage feeding back into repair → true cost per asset, farm and season. AgroRende's edge is doing this offline-first and multi-brand. The closest threats are Aegro, Auvo/uMov.me and Sisloc/Expecto Loc.

Small farms (§7) are reachable, but mostly through the cooperatives, service providers and mechanics that own and fix the machines they use, with a free single-user plan as the funnel. Selling per-seat software to farms with one tractor does not pay back.

## 2. Landscape by category

| Category | Examples | Strong at | Gap AgroRende fills |
|---|---|---|---|
| Field-service apps (FSM) | Auvo, Field Control, Produttivo, uMov.me, NextField | Mobile work orders, checklists, photos, signatures, technician GPS | Generic: no farms, plots, seasons, hour meters or rentals |
| Maintenance systems (CMMS) | Engeman, Leankeep | Preventive and corrective maintenance, offline apps, QR codes | Maintenance only: no field triage, rentals or agro cost model |
| Farm ERPs with a machinery module | Aegro, TOTVS Agro, Siagri (Aliare), Agrotis, xFarm | Finance, tax, agronomy, fuel and hour-meter logs | Farm-centric: weak mobile repair dispatch, no rental inspections |
| Rental-management systems (locadoras) | Sisloc, Expecto Loc, Nixloc, ACTLOC | Contracts, NF-e, delivery and return checklists with photos, maintenance WOs | Built for construction rental: no farms, seasons, field reports or live operations map |
| Rental marketplaces | Alluagro, TratorHub, ProntoLoc, Locae | Matching machine owners with renters | Marketplaces, not operations systems |
| OEM and telemetry platforms | John Deere Operations Center, CNH FieldOps, Solinftec | Machine data, telemetry, agronomy | Brand-locked or telemetry-first, with no field-service or rental workflow. Integration targets (P2 telematics), not rivals |

## 3. Pricing benchmarks (public information, October 2026)

| Product                                               | Category           | Pricing model                                | Public price (BRL)                                                                                                                                     | Confidence                                         |
| ----------------------------------------------------- | ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Leankeep                                              | CMMS               | per user, volume tiers, prepaid, no lock-in  | from R$ 297/month for 3 users; then R$ 99 → R$ 59 per user/month (3–9 users R$ 99, 10–19 R$ 89, 20–29 R$ 79, 30–39 R$ 69, 40–49 R$ 59; 50+ on request) | Official (vendor pricing page)                     |
| Engeman                                               | CMMS               | per user                                     | from R$ 311 per user/month (Starter/Lite/Pleno plans)                                                                                                  | Official (vendor plans page)                       |
| Field Control                                         | FSM                | per technician                               | from R$ 295 per technician/month (Basic); higher tiers on request                                                                                      | Review portals (Capterra, GetApp)                  |
| Auvo                                                  | FSM                | per user                                     | from R$ 529.70/month for 3 users (≈ R$ 177 per user)                                                                                                   | Marketplace listing (Omie app store)               |
| uMov.me                                               | FSM platform       | on request                                   | not published; one public institutional contract (OAB SP, 2025) ≈ R$ 1,530–1,615/month in total                                                        | Public contract                                    |
| Produttivo                                            | FSM                | on request                                   | not published                                                                                                                                          | —                                                  |
| Aegro                                                 | Farm ERP           | per plan and area, unlimited users           | on request (Premium includes up to 500 ha, multiple farms); its separate price-comparison product costs R$ 129–649/month                               | Official (plans pages)                             |
| TOTVS Agro (Protheus)                                 | Enterprise ERP     | users + modules, plus a setup project        | ≈ R$ 1,800–2,000/month to start, R$ 5,000+/month mid-size; setup from ≈ R$ 7,000, often tens of thousands (R$ 100k+ for large projects)                | Integrator blogs (estimate)                        |
| Siagri (Aliare)                                       | Agro ERP           | on request                                   | estimated ≈ R$ 2,000–10,000/month; setup ≈ R$ 10,000–50,000                                                                                            | Estimate, low confidence                           |
| Sisloc, Nixloc, Expecto Loc, ACTLOC                   | Rental ERP         | on request (users, branches, modules)        | market estimate R$ 250–500/month small, R$ 800–1,500 mid-size, more for large                                                                          | Estimate from a rental-software blog (Quero Locar) |
| Alluagro                                              | Rental marketplace | commission per rental                        | 5–15% of the rental value, paid by the machine owner                                                                                                   | Press (PEGN/G1, Aug 2026)                          |
| John Deere Operations Center, CNH FieldOps, Solinftec | OEM / telemetry    | bundled with machines and connectivity plans | not priced here                                                                                                                                        | —                                                  |

Prices change; confirm in demos before quoting.

## 4. What a customer pays today (illustrative)

Illustrative example: a machinery dealer with 10 mechanics and 3 office users.

- Field Control: ≈ 10 × R$ 295 = R$ 2,950/month.
- Auvo: ≈ 13 × R$ 177 ≈ R$ 2,300/month.
- Leankeep, for maintenance only: ≈ 13 × R$ 89 = R$ 1,157/month.
- If they rent machines, add a rental ERP at roughly R$ 800–1,500/month.
- They still need an ERP for finance.

Conclusion: covering field service + maintenance + rentals today means 2–3 tools for roughly R$ 3,000–5,000/month that do not share data. This is illustrative, not a quote.

## 5. Pricing hypothesis for AgroRende

This is a hypothesis to validate, not a decision.

- Charge per **active field user** (inspector, mechanic, rental agent) at R$ 149–199/month: below Field Control and Engeman, near Auvo, above Leankeep, which is maintenance only.
- Keep **office users free** (admin, manager, dispatcher), a differentiator versus per-seat tools.
- Price the rental module as an add-on: flat fee, or per rentable asset. Test both.
- No setup fee for self-onboarding with CSV import and seeded checklist templates.
- Offer optional paid onboarding.
- Offer an annual discount.
- Run a pilot covering one harvest window.

Validation plan: run 5–10 customer interviews with dealers, rental companies and large farms, then close 2 paid pilots before launch. This informs the pricing-model open question in `docs/PRD.md` §15.

## 6. Positioning

**Our position:** one offline-first, multi-brand flow: field report → repair work order → rental check-out and check-in, where new damage feeds back into repair → true cost per asset, farm and season, run from a live operations centre.

**Closest threats:** Aegro (offline app, machinery module, WhatsApp assistant) could add field service. Auvo and uMov.me are already used by agro dealers. Sisloc and Expecto Loc already combine rental and maintenance and could add an agro model.

**Differentiators to protect:** offline reliability, the inspect → repair → rent loop, and agro-native cost reporting.

## 7. Small farms: can AgroRende enter there?

Asked in round 5 (2026-10). Short answer: **yes, with a different route in.** Few competitors focus on small farms, but each small farm pays little, and most of them don't own the machines.

### 7.1 The segment in numbers (IBGE Censo Agro 2017)

- 5.07 million farms (*estabelecimentos*). 3.9 million (77%) are family farms, holding 23% of the area and 67% of the rural workforce.
- About 70% have between 1 and 50 ha.
- Only about 734 thousand farms (≈ 14%) own at least one tractor (1.22 million tractors in total). Most small farms **hire or borrow machine work**: the town hall's *patrulha mecanizada*, cooperatives and associations with shared machines (*condomínios de máquinas*), custom operators (*prestadores de serviço*) and neighbours.
- Digital use is high but shallow. In the Embrapa/Sebrae/INPE survey, 84% of producers use some digital technology, mostly WhatsApp and information apps. The top barriers are the cost of software and equipment, and connectivity.

### 7.2 Who competes for small farms

| Option | What it gives a small farm | Price | Threat to AgroRende |
|---|---|---|---|
| WhatsApp + notebook + the mechanic's phone | Calls, photos, voice notes | Free | **The real competitor.** AgroRende must feel as easy as WhatsApp |
| Free farm-diary apps: Agtor (free plan: 1 user, up to 99 ha, offline machine log), xFarm (free tier with a machinery module), Agrisoft (free modules), the Ministry of Agriculture's list of free apps | Machine log, hour meter, maintenance reminders, costs | Free or low | High for a "machine log" product; low for repair dispatch and rentals, which they don't do |
| Free spreadsheets (Aegro and others publish maintenance templates) | Preventive plan, costs | Free | Medium |
| Aegro, TOTVS Agro, Siagri | Full farm ERP | Too expensive or too heavy for 1–50 ha | Low in this segment |
| Rental marketplaces (Alluagro, TratorHub) | Find a machine to rent | Commission paid by the owner | Partner more than rival: no check-out/check-in or repair |

Conclusion: a farm-side "machine log" is crowded and free, so it can't be the pitch. **Nobody runs the machine-service loop for small farms**: getting a mechanic out with evidence, renting or borrowing a machine with proper hand-over and return checks, and knowing what each machine costs.

### 7.3 Recommended route: through the businesses that serve small farms (B2B2C)

Paying customers are the organisations that own or fix the machines small farms depend on. They use AgroRende in full: field reports, repair, rental with check-out/check-in and the live map.

1. **Cooperatives and associations with shared machines.** They lend or rent tractors and implements to members and need the hand-over checks, damage history and cost per machine. Best fit, and well organised in the South (PR, SC, RS).
2. **Custom operators and small rental companies** working for many small farms. Today they use WhatsApp or a construction-rental system.
3. **Rural mechanics, workshops and dealers' field service.** They repair for many small farms; the farmer is their customer.
4. **Town-hall *patrulhas mecanizadas*.** Large reach, but public procurement (*licitação*) makes the sale slow. Later, through a partner.

Small farmers then meet AgroRende as the **customer** of those businesses: they sign the hand-over on the operator's phone, get the PDF and the rental status by WhatsApp, and (later) request a service or a machine from a link without creating an account.

**Direct route, as a funnel and not the main revenue.** Add a free **Solo** plan: one user, a few machines, no live map, everything offline. The current design already allows it, because every role can do field work and companies sign up on their own. When a solo farm invites a second person or starts renting machines out, it moves to a paid plan.

### 7.4 What already fits and what is missing

- **Already fits:** offline-first; works on cheap Android phones (sparse media files, voice notes, big buttons); Google sign-in without IT; WhatsApp invites and support; pt-BR first; office users free; only three roles; self sign-up with a 30-day trial.
- **Missing, to decide after the MVP interviews (no MVP scope change now):**
  - A free Solo plan and a small flat "Família/Associação" price next to per-field-user pricing. R$ 149–199 per field user (§5) is too much for a one-tractor farm.
  - A customer link: request a repair or a machine through WhatsApp, without an account.
  - Shared-machine scheduling for cooperatives (a booking calendar per machine, with a queue in the busy season).
  - Pix payment for rentals (billing stays outside the app in the MVP).

### 7.5 Validation before committing

- Interviews: 5 small farmers, 3 cooperatives or associations with shared machines, 2 custom operators, 1 town hall with a *patrulha mecanizada*, 2 rural mechanics.
- Questions: how a machine is requested, handed over and returned today; who pays for damage; what they pay today for anything digital; whether a cooperative would pay per machine, per member or a flat fee.
- Go signal: at least 2 cooperatives or service providers agree to a paid pilot covering one harvest window, and at least half of the farmers interviewed would use a WhatsApp link to request a service.

## 8. Next steps

- Book demos for Aegro, Auvo, Field Control, Sisloc and Expecto Loc, then record features and prices in this file.
- Try Agtor and xFarm's free plans with one small-farm machine list, and run the §7.5 interviews.
- Run an INPI trademark search for AgroRende in classes 9 and 42.
- Revisit this landscape after the MVP.

## 9. Sources

- https://pages.leankeep.com/planos-leankeep/
- https://engeman.com.br/pt-br/planos/
- https://www.capterra.com.br/software/207608/field-control
- https://www.getapp.com/operations-management-software/a/field-control/
- https://store.omie.com.br/apps/auvo
- https://www.oabsp.org.br/noticia/25-04-16-1511-umovme
- https://www.produttivo.com.br/planos/
- https://aegro.com.br/produtos/plano-aegro-premium/
- https://compare.aegro.com.br/planos
- https://logostechnology.com.br/totvs-protheus-preco/
- https://www.systh.com.br/quanto-custa-o-totvs-protheus-licencas-implantacao-e-custo-total/
- https://www.siagri.com.br/
- https://sisloc.com/
- https://expecto.com.br/
- https://www.nixloc.com.br/
- https://actloc.com.br/gestao-locadora-equipamentos
- https://querolocar.com.br/blog/quanto-custa-sistema-para-locadora
- https://g1.globo.com/empreendedorismo/pegn/noticia/2026/08/26/agronomo-cria-marketplace-de-aluguel-de-maquinas-agricolas-e-fatura-r-5-milhoes-por-ano.ghtml
- https://alluagro.com.br/termos-de-uso/
- https://www.ibge.gov.br/biblioteca/visualizacao/periodicos/3096/agro_2017_estabelecimentos_agropecuarios.pdf
- https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/25789-censo-agro-2017-populacao-ocupada-nos-estabelecimentos-agropecuarios-cai-8-8
- https://www.alice.cnptia.embrapa.br/alice/handle/doc/1127064
- https://www.semear-digital.cnptia.embrapa.br/noticia/11/2025/pesquisas-buscam-vencer-o-desafio-da-conectividade-no-campo/
- https://www.agtor.com.br/
- https://www.xfarm.ag/br/macchinari
- https://agrisoft.com.br/download-programa-rural-gratis
- https://conhecimento.aegro.com.br/planilha-manutencao-de-maquinas-agricolas
- https://www.gov.br/agricultura/pt-br/assuntos/inovacao/agrohub-brasil/produtores-rurais/aplicativos-para-o-produtor-rural/aplicativos-para-o-produtor-rural-1

*End of the competitive landscape.*
