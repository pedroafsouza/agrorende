
/**
 * Rental hand-over and return document trees (RN-05). `packages/core` may not import React
 * (ARCHITECTURE §4), so the trees are built from react-pdf primitives with a minimal element
 * factory instead of JSX. Rendering happens in `src/pdf/rentalCheckout.tsx` and `rentalCheckin.tsx`.
 */

export type PdfLocale = "pt-BR" | "en";

export interface RentalPdfDamage {
  readonly zone: string;
  readonly severity: string;
  readonly description: string | null;
  readonly isPreExisting: boolean;
  readonly estimatedCostCents: number | null;
  readonly disputeStatus: string;
  readonly matchStatus: string;
}

export interface RentalPdfData {
  readonly locale: PdfLocale;
  readonly timeZone: string;
  readonly orgName: string;
  readonly rental: {
    readonly number: string;
    readonly direction: string;
    readonly plannedStart: Date;
    readonly plannedEnd: Date;
    readonly actualStart: Date | null;
    readonly actualEnd: Date | null;
    readonly rateCents: number;
    readonly rateUnit: string;
    readonly depositCents: number;
    readonly fuelPolicy: string;
  };
  readonly customer: { readonly name: string; readonly taxId: string | null };
  readonly asset: { readonly code: string; readonly name: string };
  readonly inspection: {
    readonly performedAt: Date;
    readonly performedBy: string | null;
    readonly hourMeter: number | null;
    readonly odometerKm: number | null;
    readonly fuelPercent: number | null;
    readonly checklist: readonly { readonly label: string; readonly value: string }[];
    readonly accessories: readonly { readonly label: string; readonly expected: number; readonly present: number }[];
    readonly operatorName: string | null;
    readonly safetyBriefingGiven: boolean;
    readonly termsAccepted: boolean;
    readonly termsVersion: number | null;
    readonly signerName: string | null;
    readonly signatureStatus: string;
    readonly signatureReason: string | null;
    readonly notes: string | null;
  };
  readonly damages: readonly RentalPdfDamage[];
  readonly charges?: {
    readonly lines: readonly { readonly description: string; readonly amountCents: number }[];
    readonly totalCents: number;
    readonly depositCents: number;
    readonly balanceDueCents: number;
  };
}

// ───────── Element factory (react-pdf primitives, no React import) ─────────

export interface PdfNode {
  readonly $$typeof: symbol;
  readonly type: string;
  readonly key: string | null;
  readonly ref: null;
  readonly props: Record<string, unknown>;
}

type Child = PdfNode | string | number | null | false | readonly Child[];

const ELEMENT = Symbol.for("react.transitional.element");

export function h(type: "DOCUMENT" | "PAGE" | "VIEW" | "TEXT", props: Record<string, unknown> | null, ...children: Child[]): PdfNode {
  const flat = children.flat(2).filter((child) => child !== null && child !== false);
  const keyed = flat.map((child, index) => (typeof child === "object" && child !== null && "type" in child ? { ...child, key: child.key ?? String(index) } : child));
  const element = {
    $$typeof: ELEMENT,
    type,
    key: null,
    ref: null,
    props: { ...(props ?? {}), children: keyed.length === 1 ? keyed[0] : keyed },
    _owner: null,
    _store: { validated: 1 },
  };
  return element;
}

export const styles = {
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1F2A1C" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#4A5A44", marginBottom: 12 },
  section: { marginBottom: 10 },
  heading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 4, borderBottom: "1pt solid #C9D3C2", paddingBottom: 2 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 150, color: "#4A5A44" },
  value: { flex: 1 },
  tableRow: { flexDirection: "row", borderBottom: "0.5pt solid #E1E7DC", paddingVertical: 2 },
  cell: { flex: 1 },
  cellRight: { width: 90, textAlign: "right" },
  total: { flexDirection: "row", marginTop: 4, fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 18, fontSize: 8, color: "#4A5A44" },
} as const;

// ───────── Labels (document language is frozen on the rental) ─────────

const LABELS = {
  "pt-BR": {
    checkoutTitle: "Termo de entrega de máquina",
    checkinTitle: "Termo de devolução de máquina",
    rental: "Locação",
    customer: "Cliente",
    taxId: "Documento",
    machine: "Máquina",
    period: "Período previsto",
    actual: "Período realizado",
    rate: "Valor",
    deposit: "Caução",
    fuelPolicy: "Política de combustível",
    readings: "Leituras",
    hourMeter: "Horímetro",
    odometer: "Hodômetro (km)",
    fuel: "Combustível",
    checklist: "Checklist",
    accessories: "Acessórios",
    expected: "Entregues",
    present: "Presentes",
    damages: "Avarias",
    noDamages: "Nenhuma avaria registrada.",
    preExisting: "pré-existente",
    newDamage: "nova",
    cost: "Custo estimado",
    disputed: "contestada",
    unclear: "a confirmar",
    briefing: "Orientação de segurança",
    operator: "Operador",
    terms: "Termos aceitos (versão)",
    signature: "Assinatura do cliente",
    signer: "Assinado por",
    agent: "Agente",
    performedAt: "Data da vistoria",
    notes: "Observações",
    charges: "Cobranças",
    total: "Total",
    balance: "Saldo a pagar",
    yes: "Sim",
    no: "Não",
    signed: "Assinado",
    absent: "Cliente ausente",
    refused: "Cliente recusou",
    footer: "Documento gerado pelo AgroRende. As fotos e assinaturas ficam guardadas no histórico da locação.",
  },
  en: {
    checkoutTitle: "Machine hand-over record",
    checkinTitle: "Machine return record",
    rental: "Rental",
    customer: "Customer",
    taxId: "Document",
    machine: "Machine",
    period: "Planned period",
    actual: "Actual period",
    rate: "Rate",
    deposit: "Deposit",
    fuelPolicy: "Fuel policy",
    readings: "Readings",
    hourMeter: "Hour meter",
    odometer: "Odometer (km)",
    fuel: "Fuel",
    checklist: "Checklist",
    accessories: "Accessories",
    expected: "Handed over",
    present: "Present",
    damages: "Damages",
    noDamages: "No damage recorded.",
    preExisting: "pre-existing",
    newDamage: "new",
    cost: "Estimated cost",
    disputed: "disputed",
    unclear: "to confirm",
    briefing: "Safety briefing",
    operator: "Operator",
    terms: "Terms accepted (version)",
    signature: "Customer signature",
    signer: "Signed by",
    agent: "Agent",
    performedAt: "Inspection date",
    notes: "Notes",
    charges: "Charges",
    total: "Total",
    balance: "Balance due",
    yes: "Yes",
    no: "No",
    signed: "Signed",
    absent: "Customer absent",
    refused: "Customer refused",
    footer: "Document generated by AgroRende. Photos and signatures are kept in the rental history.",
  },
} as const;

export type PdfLabels = (typeof LABELS)[PdfLocale];

export function labelsFor(locale: PdfLocale): PdfLabels {
  return LABELS[locale];
}

export function money(cents: number, locale: PdfLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function when(value: Date | null, data: Pick<RentalPdfData, "locale" | "timeZone">): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat(data.locale, { dateStyle: "short", timeStyle: "short", timeZone: data.timeZone }).format(value);
}

export function field(label: string, value: string | number | null): PdfNode {
  return h("VIEW", { style: styles.row }, h("TEXT", { style: styles.label }, label), h("TEXT", { style: styles.value }, value === null ? "—" : String(value)));
}

export function section(title: string, ...children: Child[]): PdfNode {
  return h("VIEW", { style: styles.section, wrap: false }, h("TEXT", { style: styles.heading }, title), ...children);
}

function signatureText(data: RentalPdfData, l: PdfLabels): string {
  const status = data.inspection.signatureStatus;
  if (status === "SIGNED") return l.signed;
  const base = status === "REFUSED" ? l.refused : l.absent;
  return data.inspection.signatureReason === null ? base : `${base} — ${data.inspection.signatureReason}`;
}

/** Sections shared by the hand-over and the return document. */
export function commonSections(data: RentalPdfData, l: PdfLabels): PdfNode[] {
  const { rental, inspection } = data;
  return [
    section(
      l.rental,
      field(l.customer, data.customer.name),
      field(l.taxId, data.customer.taxId),
      field(l.machine, `${data.asset.code} · ${data.asset.name}`),
      field(l.period, `${when(rental.plannedStart, data)} → ${when(rental.plannedEnd, data)}`),
      field(l.actual, `${when(rental.actualStart, data)} → ${when(rental.actualEnd, data)}`),
      field(l.rate, `${money(rental.rateCents, data.locale)} / ${rental.rateUnit}`),
      field(l.deposit, money(rental.depositCents, data.locale)),
      field(l.fuelPolicy, rental.fuelPolicy),
    ),
    section(
      l.readings,
      field(l.performedAt, when(inspection.performedAt, data)),
      field(l.hourMeter, inspection.hourMeter),
      field(l.odometer, inspection.odometerKm),
      field(l.fuel, inspection.fuelPercent === null ? null : `${inspection.fuelPercent}%`),
    ),
    section(l.checklist, ...inspection.checklist.map((item) => field(item.label, item.value))),
    section(
      l.accessories,
      h("VIEW", { style: styles.tableRow }, h("TEXT", { style: styles.cell }, ""), h("TEXT", { style: styles.cellRight }, l.expected), h("TEXT", { style: styles.cellRight }, l.present)),
      ...inspection.accessories.map((line) =>
        h("VIEW", { style: styles.tableRow }, h("TEXT", { style: styles.cell }, line.label), h("TEXT", { style: styles.cellRight }, line.expected), h("TEXT", { style: styles.cellRight }, line.present)),
      ),
    ),
    section(
      l.damages,
      data.damages.length === 0
        ? h("TEXT", null, l.noDamages)
        : data.damages.map((damage) => {
            const tags: string[] = [damage.isPreExisting ? l.preExisting : l.newDamage];
            if (damage.disputeStatus === "DISPUTED") tags.push(l.disputed);
            if (damage.matchStatus === "UNCLEAR") tags.push(l.unclear);
            const cost = damage.estimatedCostCents === null ? "" : ` · ${l.cost}: ${money(damage.estimatedCostCents, data.locale)}`;
            return h("TEXT", { style: { marginBottom: 2 } }, `${damage.zone} · ${damage.severity} (${tags.join(", ")})${damage.description === null ? "" : ` — ${damage.description}`}${cost}`);
          }),
    ),
  ];
}

export function signatureSection(data: RentalPdfData, l: PdfLabels): PdfNode {
  return section(
    l.signature,
    field(l.signature, signatureText(data, l)),
    field(l.signer, data.inspection.signerName),
    field(l.agent, data.inspection.performedBy),
    data.inspection.notes === null ? null : field(l.notes, data.inspection.notes),
  );
}

export function documentOf(title: string, data: RentalPdfData, l: PdfLabels, body: Child[]): PdfNode {
  return h(
    "DOCUMENT",
    { title: `${title} ${data.rental.number}`, author: data.orgName, language: data.locale },
    h(
      "PAGE",
      { size: "A4", style: styles.page },
      h("TEXT", { style: styles.title }, title),
      h("TEXT", { style: styles.subtitle }, `${data.orgName} · ${l.rental} ${data.rental.number}`),
      ...body,
      h("TEXT", { style: styles.footer, fixed: true }, l.footer),
    ),
  );
}

/** Check-out (hand-over) document: readings, checklist, known damages, briefing, terms and signatures. */
export function rentalCheckoutDocument(data: RentalPdfData): PdfNode {
  const l = labelsFor(data.locale);
  return documentOf(l.checkoutTitle, data, l, [
    ...commonSections(data, l),
    section(
      l.briefing,
      field(l.briefing, data.inspection.safetyBriefingGiven ? l.yes : l.no),
      field(l.operator, data.inspection.operatorName),
      field(l.terms, data.inspection.termsAccepted ? (data.inspection.termsVersion ?? l.yes) : l.no),
    ),
    signatureSection(data, l),
  ]);
}
/** Check-in (return) document: return readings, damages found and the charges summary. */
export function rentalCheckinDocument(data: RentalPdfData): PdfNode {
  const l = labelsFor(data.locale);
  const charges = data.charges;
  return documentOf(l.checkinTitle, data, l, [
    ...commonSections(data, l),
    charges === undefined
      ? null
      : section(
          l.charges,
          ...charges.lines.map((line) =>
            h("VIEW", { style: styles.tableRow }, h("TEXT", { style: styles.cell }, line.description), h("TEXT", { style: styles.cellRight }, money(line.amountCents, data.locale))),
          ),
          h("VIEW", { style: styles.total }, h("TEXT", { style: styles.cell }, l.total), h("TEXT", { style: styles.cellRight }, money(charges.totalCents, data.locale))),
          field(l.deposit, money(charges.depositCents, data.locale)),
          h("VIEW", { style: styles.total }, h("TEXT", { style: styles.cell }, l.balance), h("TEXT", { style: styles.cellRight }, money(charges.balanceDueCents, data.locale))),
        ),
    signatureSection(data, l),
  ]);
}
