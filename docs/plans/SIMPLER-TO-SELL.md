# Simpler to sell

This plan makes AgroRende easier to explain, easier to try and easier to buy. It is written
for the whole team, including people who are not specialists in software, sales or design.
Every recommendation says what to change, why it matters for a sale, and how we will know
it worked.

The detailed findings behind this plan are in `docs/reviews/sell-simplicity-review.md`.
Animation work is described in §6 and is owned by the `@agrorende/motion` package.

## 1. The story in one page

### Who buys

The buyer is the owner or operations manager of a company that keeps machines working in
the field: machinery dealers with mobile mechanics, rental companies, contractors, large
farms and cooperatives. The person who pays is rarely the person who uses the phone app.
The technician uses the app; the owner signs the cheque.

We are not selling to a farmer with one tractor. That market is reached later through the
cooperatives and service companies that already serve those farmers.

### The one sentence

> AgroRende shows how much each machine really costs and earns, because the team in the
> field records every inspection, repair and rental on the phone, even without signal.

Every page, slide, video and sales call should be able to fall back on that sentence.

### The three jobs

A customer hires AgroRende for three jobs. Everything else is secondary.

1. **Know what is happening in the field today.** Reports, photos and job status reach the
   office as soon as the phone finds signal.
2. **Stop arguing about what happened.** Before-and-after photos, checklists and the
   customer's signature settle disputes about repairs and rentals.
3. **Know the real cost per machine hour.** Parts, labour, fuel and downtime roll up per
   machine, so the owner can price rentals and services with confidence.

### The moment it clicks

A new customer understands the value when the first report made on a phone, without signal,
appears on the office screen with its photos. Onboarding, the landing page and the demo
video all aim to get a person to that moment as fast as possible: target under ten minutes
from signup.

### What we stop saying

| Today | Say instead | Why |
|---|---|---|
| ERP de campo | Controle das máquinas no campo | Small owners associate ERP with expensive, slow projects. |
| Sincronização, fila, outbox | Salvo no celular, enviado quando tiver sinal | Describes the outcome, not the mechanism. |
| Central de operações | Visão geral | Plain words a new user can guess. |
| Atenção, triagem | Pendências | One word everyone already uses. |
| Dispositivos | Celulares da equipe | Names the real object. |
| Template | Modelo de checklist | Portuguese, and says what it is. |
| Importar CSV | Trazer sua planilha | Customers have spreadsheets, not CSV files. |
| Código do erro | Código para o suporte | Explains why the code is shown. |

## 2. Principles for every team

These principles connect product, design and sales decisions. When a choice is unclear,
use them in order.

1. **One next step.** Every screen has exactly one primary action, and the empty state
   explains it with an animation and one sentence.
2. **Show, then tell.** An animation or a real screenshot comes before any paragraph.
3. **Hide, do not delete.** Advanced modules stay in the product but start switched off.
   A customer turns them on in *Configurações → Recursos* when they need them.
4. **The field first.** If a feature does not help the technician finish a job faster, it
   does not belong in the mobile app's first screen.
5. **Plain Portuguese.** No English words, acronyms or internal names in user-facing copy.
6. **Campo claro wins.** Forty-eight pixel touch targets, outdoor contrast, an icon always
   paired with text, one palette (`docs/ARCHITECTURE.md` §3.7).

## 3. Landing page

The landing page has one job: make an owner say "I want to try this" within one minute.

### Structure of the home page

The home page goes from ten sections to seven, each with one animation and at most forty
words.

1. **Hero.** Headline in outcome language ("Saiba quanto cada máquina custa e rende"), one
   sentence below it, one primary button "Testar grátis por 30 dias" and one quiet link to
   the product video. The `welcome` animation plays once.
2. **The problem.** Paper, WhatsApp groups and spreadsheets lose photos and hours. Short
   comparison of "hoje" against "com AgroRende".
3. **How it works.** Three steps tied to the three jobs, animated with `report-offline`,
   `flow-loop` and `machine-cost`.
4. **Works without signal.** The `saved-on-phone` animation and one sentence.
5. **Mission.** Why AgroRende exists, in three sentences (see below).
6. **Questions buyers ask.** Price, contract, data ownership, support, what happens after
   the trial, whether it works with every machine brand.
7. **Final call to action.** The same button as the hero and a WhatsApp link.

Pilot results, testimonials and customer logos replace the "pilot" section as soon as the
first customers authorise them. Until then the page does not promise results we have not
measured.

### Calls to action

There is one primary action everywhere: **Testar grátis por 30 dias**. WhatsApp is the
single secondary action ("Falar com a gente no WhatsApp"). E-mail moves to the footer and
help page. Login stays in the header as a quiet link. Store badges appear only when the
store URLs are configured.

### Mission section

> Máquina parada é dinheiro perdido. A AgroRende existe para que quem cuida das máquinas
> no campo trabalhe com informação, e não com papel e memória. Começamos pelas equipes de
> manutenção e locação, porque é ali que cada hora conta.

### Recursos page

The features page opens with the narrated product video (captions, poster frame, no
autoplay) and then one block per job instead of one block per module.

### Planos page

One plan, priced per field user, with office users free and the rental module as an
optional add-on. The page answers "how much will I pay?" with a simple example: "Equipe com
5 técnicos: R$ 745 por mês". The note that prices are still being defined is removed from
the public page; while prices are hidden, the button becomes "Pedir uma proposta" and goes
to WhatsApp.

### Help page

Help starts with the most common questions and a WhatsApp button. The searchable list of
188 error pages stays reachable through search and through links inside the product, but it
leaves the help page's main content.

### Trust

Remove "Revisão jurídica pendente" from public legal pages once the legal review is done;
until then, show it only in a footnote. Add a short "Seus dados são seus" block: export at
any time, LGPD, and the hosting region once it is decided.

### Accessibility checklist for the landing page

- Body text at least 18 px on mobile, line length under 75 characters.
- Every animation respects `prefers-reduced-motion` and shows its poster frame instead.
- Every animation is decorative (`aria-hidden`) and the meaning is in the text next to it.
- A visible pause control for any looping animation longer than five seconds.
- All buttons at least 48 px tall, focus ring visible on white and dark backgrounds.
- The existing axe, touch-target and console-error e2e checks keep passing.

## 4. Admin web

### Navigation

The six sidebar categories stay. Inside them, only the pages a customer needs in the first
month are visible by default:

| Category | Visible by default | Hidden until switched on |
|---|---|---|
| Visão geral | Visão geral, Pendências | Análises |
| Serviços | Ordens de serviço, Relatos | Manutenção preventiva |
| Frota | Máquinas | Combustível, Peças, Estoque |
| Clientes | Clientes, Locações, Fazendas | — |
| Financeiro | Custos | Cobranças |
| Administração | Equipe, Configurações | Importar planilha, Safras, Celulares da equipe |

Checklist templates move inside Ordens de serviço as a tab. Notifications merge into
Pendências. Account settings stay in the user menu.

A new *Configurações → Recursos* page lists each optional module with an animation, one
sentence and a switch. Modules are stored per organisation; turning one off hides it from
the menu but never deletes data.

### First run

Replace the checklist panel with a guided first run that takes under ten minutes:

1. **Boas-vindas** (`welcome`): what the product does in one sentence.
2. **Primeira máquina** (`first-machine`): name and category only. Everything else is under
   "Mais detalhes".
3. **Convidar a equipe** (`invite-team`): one technician, shared by WhatsApp link or QR code.
4. **Primeira ordem de serviço** (`first-work-order`): title and machine pre-filled.
5. **Pronto** (`success`): explains what happens next and links to the mobile app.

The guide can be skipped at any step and resumed from a small progress card on Visão geral.
A later phase adds the type of business to step 1 (to pre-select modules) and a "Ver com
dados de exemplo" option that opens a separate demo organisation.

### Forms

Required fields are the minimum that makes a record useful. Dates default to today, the
responsible person defaults to the current user, priority defaults to normal. Optional
fields sit under "Mais detalhes".

### Top bar

Keep only the organisation name, search, notifications and the user menu. Theme and
language move to the user menu. Technical status text (realtime provider, environment) is
shown only to administrators and only when something is wrong.

### Empty states

Every list has an empty state with the `empty` animation (or a page-specific one), one
sentence explaining what the page is for, and one button.

## 5. Mobile field app

### First run for the technician

A three-card introduction plays once after the first login: `report-offline` ("Funciona sem
sinal"), `flow-loop` ("Do relato à entrega") and `signature` ("O cliente assina no seu
celular"). It can be skipped and never shows again.

### Access

Keep invite code and e-mail, but accept a QR code or a WhatsApp deep link that fills the
code automatically. Show the e-mail the office used, partially masked, when it does not
match.

### Tabs

The default tabs become **Hoje**, **Serviços** and **Mais**. Relatos and Locações appear as
tabs only when the organisation uses them; otherwise they are reachable from Hoje.

### Words

Replace "sincronização", "fila", "pendente" and "diagnóstico" with "salvo no celular",
"enviado" and "enviar informações para o suporte". The sync centre stays in *Mais* as
"Envios" with the `saved-on-phone` animation.

## 6. Motion system (Lottie)

Animations are the cheapest way to explain a product to people who do not read long text.
We use them generously, but always with purpose: each one explains one idea or confirms one
action.

- **Package.** `packages/motion` generates original Lottie files from TypeScript, so the
  animations are reproducible, small, in the Campo claro palette and free of licensing
  questions.
- **Players.** Web and landing use `lottie-web` (SVG renderer) through a small client
  component that loads the JSON lazily; mobile uses `lottie-react-native`.
- **Rules.** No text inside animations; meaning lives in translated copy beside them.
  `prefers-reduced-motion` (web) and *Reduce motion* (mobile) show the poster frame.
  Animations are decorative for screen readers. Looping animations pause when off screen.
- **Catalogue.** `welcome`, `report-offline`, `flow-loop`, `machine-cost`, `office-live`,
  `invite-team`, `first-machine`, `first-work-order`, `signature`, `success`, `empty`,
  `saved-on-phone`, `rental-handover`, `loading`.

## 7. Sales kit

- **Demo video, about ten minutes, Portuguese.** End-to-end story with the demo data: the
  landing page, the owner's first run, the office view, a technician's report from the
  phone, a work order with photos and signature, a rental out and back, and the cost per
  machine hour. Produced from recorded screens, synthetic Portuguese narration and captions.
- **Short cut** of the same video for the Recursos page and WhatsApp.
- **Demo organisation** that resets every night for sales calls.
- **One-page PDF** with the one sentence, three jobs, price example and contact.

## 8. Roadmap

| Phase | Scope | Size |
|---|---|---|
| Now | Motion package; Lottie in landing, admin and mobile; landing copy, mission and single CTA; admin first-run guide; empty states; jargon pass; ten-minute demo video | Large |
| Next | Configurações → Recursos switches; hidden modules by default; template and notification merges; quick asset form; demo organisation reset; mobile QR invite | Medium |
| Later | Payment by Pix and boleto; invoices; WhatsApp notifications to customers; spreadsheet import wizard; referral programme; real testimonials and case study | Large |

## 9. How we measure

| Signal | Target |
|---|---|
| Landing visitor to trial signup | Above 3 % |
| Signup to first machine | Above 80 % in the first session |
| Signup to first field report from a phone | Above 50 % within 3 days |
| Time from signup to first report on the office screen | Under 10 minutes median |
| Trial to paid | Above 25 % |
| Weekly active field users after 30 days | Above 85 % of invited technicians |

## 10. Glossary

| Term | Meaning |
|---|---|
| Relato | A report a technician makes about a machine: problem, photos, location. |
| Ordem de serviço | A job to fix or check a machine, assigned to a technician. |
| Locação | Renting a machine to a customer, with checklists on the way out and back. |
| Horímetro | The machine's hour counter, used to calculate cost per hour and maintenance. |
| Módulo | A part of the product that can be switched on or off, such as Peças or Combustível. |
| Primeiro uso | The guided steps a new customer sees right after signing up. |
| Lottie | A small animation file that plays smoothly on web and phones. |
| Trial | The 30 free days before the customer decides to pay. |
| Conversão | The share of people who move to the next step, for example from visit to signup. |
