# Sell-simplicity review

Findings from the audit that produced `docs/plans/SIMPLER-TO-SELL.md`. One line per
finding, in the review format `<path>:<line>: <severity> <problem>. <fix>.`
Severities: blocking (stops a sale or a first run), major (slows understanding), minor.

## Landing

- apps/landing/messages/pt-BR/site.json:93: major Hero headline "O ERP de campo do agro." leads with a category word small owners distrust. Lead with the outcome: cost and earnings per machine.
- apps/landing/src/views/Home.tsx:88: major Ten sections on the home page dilute the message. Cut to seven sections with one animation each.
- apps/landing/src/components/CtaGroup.tsx:14: major Signup, login, WhatsApp, e-mail and store links compete. One primary button, WhatsApp as the only secondary action.
- apps/landing/messages/pt-BR/site.json:177: major The pilot section says results are pending, which reads as "unproven". Replace with a mission statement until real results exist.
- apps/landing/messages/pt-BR/site.json:205: minor "Base do ERP agro", "telemetria", "CSV", "triagem" are jargon. Rewrite in plain Portuguese.
- apps/landing/messages/pt-BR/site.json:237: major Pricing says values are still being defined. Remove; show a team-size price example or a "Pedir uma proposta" button.
- apps/landing/src/views/Help.tsx:35: major The error-code index sits in the main help content. Move it behind search and in-product links.
- apps/landing/src/views/Legal.tsx:25: major "Revisão jurídica pendente" banner on every legal page hurts trust. Move to a footnote until the review is done.
- apps/landing/src/views/Features.tsx:14: major No product video on Recursos. Embed the narrated video with captions and a poster.
- apps/landing/src/components/Demos.tsx:284: minor Continuous CSS demos have an easy-to-miss pause control. Replace with Lottie that respects reduced motion and pauses off screen.
- apps/landing/src/views/Pricing.tsx:70: minor Caveat and notes in `text-sm`. Use body size for anything a buyer must read.

## Admin web

- apps/web/src/features/onboarding/GettingStartedPanel.tsx:11: blocking No guided first run; the checklist stops before the first work order. Add a five-step guide ending at the first work order.
- apps/web/src/components/shell/nav.ts:28: major P1 modules (analytics, maintenance, fuel, parts, stock, billing) are visible on day one. Hide behind per-organisation module switches.
- apps/web/src/features/assets/AssetForm.tsx:85: major Fourteen visible fields to add a machine. Show name and category; put the rest under "Mais detalhes".
- apps/web/messages/pt-BR/web.json:36: major "Realtime provider placeholder" is visible developer text. Remove or show to administrators only on failure.
- apps/web/messages/pt-BR/team.json:30: minor "Última sincronização" and battery wording are technical. Say "Última atualização do celular".
- apps/web/messages/pt-BR/admin.json:94: minor "Buscar ou executar um comando" exposes the command palette concept. Say "Buscar".
- apps/web/messages/pt-BR/admin.json:230: minor "Envie um CSV" assumes the format. Say "Envie sua planilha".
- apps/web/src/features/work-orders/WorkOrdersListPage.tsx:98: minor Empty states are text only. Add an animation and one sentence on why the page matters.

## Mobile

- apps/mobile/app/(app)/(tabs)/_layout.tsx:24: major Five equal tabs hide the core loop. Default to Hoje, Serviços and Mais.
- apps/mobile/src/i18n/pt-BR/sync.json:12: major "Pendente", "Na fila", "registros de diagnóstico" are technical. Say "Salvo no celular" and "Enviado".
- apps/mobile/src/i18n/pt-BR/auth.json:14: major Invite code typed by hand, e-mail must match exactly. Accept a QR or WhatsApp link that fills the code.
- apps/mobile/app/(auth)/onboarding.tsx:1: minor No product introduction for the technician. Add a three-card animated introduction shown once.

## Business

- docs/PRD.md:498: blocking Pix, boleto and card payments are P1, so a trial cannot convert inside the product. Prioritise payment after the first-run work.
- docs/PRD.md:737: major Spreadsheet import is undecided, but every prospect has a spreadsheet. Commit to a guided import in the next phase.
- docs/LANDSCAPE.md:63: major Pricing is still a hypothesis. Decide one per-technician price before launch.
- docs/PRD.md:67: minor No referral mechanism. Add a referral offer after payment exists.
