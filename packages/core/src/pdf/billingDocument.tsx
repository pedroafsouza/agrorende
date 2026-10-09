import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/**
 * Billing document PDF (ERP-08, PLT-11, PLT-16). Core has no JSX and may not import React
 * statically, so the tree is built with `createElement` from a lazy import, like
 * `workOrderReport.tsx`. Labels are bundled for both document locales.
 */

export type BillingPdfLocale = "pt-BR" | "en";

export interface BillingPdfLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly amountCents: number;
}

export interface BillingPdfData {
  readonly locale: BillingPdfLocale;
  readonly timeZone: string;
  readonly currency: string;
  readonly org: { readonly name: string; readonly taxId: string | null };
  readonly customer: { readonly name: string; readonly taxId: string | null; readonly address: string | null };
  readonly document: {
    readonly number: string;
    readonly status: string;
    readonly source: string;
    readonly sourceNumber: string | null;
    readonly issuedAt: Date | null;
    readonly dueAt: Date | null;
    readonly paidAt: Date | null;
    readonly nfeNumber: string | null;
    readonly nfeKey: string | null;
    readonly notes: string | null;
    readonly lines: readonly BillingPdfLine[];
    readonly subtotalCents: number;
    readonly discountCents: number;
    readonly totalCents: number;
  };
  readonly generatedAt: Date;
}

const LABELS = {
  "pt-BR": {
    title: "Documento de cobrança",
    customer: "Cliente",
    taxId: "CPF/CNPJ",
    address: "Endereço",
    source: "Origem",
    sources: { WORK_ORDER: "Ordem de serviço", RENTAL: "Locação", MANUAL: "Manual" } as Record<string, string>,
    status: "Situação",
    statuses: { DRAFT: "Rascunho", ISSUED: "Emitido", PAID: "Pago", CANCELLED: "Cancelado" } as Record<string, string>,
    issuedAt: "Emitido em",
    dueAt: "Vencimento",
    paidAt: "Pago em",
    nfe: "NF-e (referência)",
    nfeKey: "Chave NF-e",
    description: "Descrição",
    quantity: "Qtd.",
    unit: "Valor unit.",
    amount: "Valor",
    subtotal: "Subtotal",
    discount: "Desconto",
    total: "Total",
    notes: "Observações",
    generated: "Gerado em",
    draft: "RASCUNHO — sem valor de cobrança",
    cancelled: "CANCELADO",
  },
  en: {
    title: "Billing document",
    customer: "Customer",
    taxId: "Tax ID",
    address: "Address",
    source: "Source",
    sources: { WORK_ORDER: "Work order", RENTAL: "Rental", MANUAL: "Manual" } as Record<string, string>,
    status: "Status",
    statuses: { DRAFT: "Draft", ISSUED: "Issued", PAID: "Paid", CANCELLED: "Cancelled" } as Record<string, string>,
    issuedAt: "Issued",
    dueAt: "Due",
    paidAt: "Paid",
    nfe: "NF-e (reference)",
    nfeKey: "NF-e key",
    description: "Description",
    quantity: "Qty",
    unit: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    discount: "Discount",
    total: "Total",
    notes: "Notes",
    generated: "Generated",
    draft: "DRAFT — not a valid bill",
    cancelled: "CANCELLED",
  },
} as const;

export function billingLabels(locale: BillingPdfLocale): (typeof LABELS)[BillingPdfLocale] {
  return LABELS[locale];
}

const colors = { ink: "#1F2A1F", muted: "#5B665B", line: "#D5DBD0", band: "#EEF2EA", accent: "#2F6B3A", danger: "#A3361F" };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, color: colors.ink, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: colors.accent, paddingBottom: 8, marginBottom: 12 },
  org: { fontSize: 10, color: colors.muted },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  number: { fontSize: 12, fontFamily: "Helvetica-Bold", color: colors.accent, textAlign: "right" },
  banner: { fontFamily: "Helvetica-Bold", color: colors.danger, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  cell: { width: "50%", paddingVertical: 2, flexDirection: "row" },
  label: { width: 90, color: colors.muted },
  value: { flex: 1 },
  head: { flexDirection: "row", backgroundColor: colors.band, padding: 4, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.line, paddingVertical: 3, paddingHorizontal: 4 },
  colWide: { flex: 4 },
  col: { flex: 1, textAlign: "right" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { fontFamily: "Helvetica-Bold", fontSize: 11, borderTopWidth: 1, borderTopColor: colors.ink, paddingTop: 3 },
  notes: { marginTop: 12, lineHeight: 1.35 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: colors.muted },
});

interface El {
  readonly type: unknown;
  readonly props: unknown;
}
type Child = El | string | null;
type CreateElement = (type: unknown, props: Record<string, unknown> | null, ...children: Child[]) => El;

async function loadCreateElement(): Promise<CreateElement> {
  const react = (await import("react")) as unknown as { createElement: CreateElement };
  return react.createElement;
}

export async function renderBillingDocument(data: BillingPdfData): Promise<Uint8Array> {
  const h = await loadCreateElement();
  const l = billingLabels(data.locale);
  const d = data.document;
  const money = (cents: number): string => new Intl.NumberFormat(data.locale, { style: "currency", currency: data.currency }).format(cents / 100);
  const date = (value: Date | null): string =>
    value === null ? "—" : new Intl.DateTimeFormat(data.locale, { dateStyle: "short", timeZone: data.timeZone }).format(value);
  const qty = (value: number): string => new Intl.NumberFormat(data.locale, { maximumFractionDigits: 2 }).format(value);
  const text = (style: object | object[] | undefined, value: string | null): El => h(Text, { style }, value === null || value === "" ? "—" : value);
  const field = (label: string, value: string | null): El => h(View, { style: styles.cell }, text(styles.label, label), text(styles.value, value));
  const total = (label: string, value: string, grand = false): El =>
    h(View, { style: grand ? [styles.totalRow, styles.grand] : styles.totalRow }, text(undefined, label), text(undefined, value));

  const banner = d.status === "DRAFT" ? text(styles.banner, l.draft) : d.status === "CANCELLED" ? text(styles.banner, l.cancelled) : null;
  const source = `${l.sources[d.source] ?? d.source}${d.sourceNumber === null ? "" : ` · ${d.sourceNumber}`}`;

  const tree = h(
    Document,
    { title: `${l.title} ${d.number}`, author: data.org.name },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(
        View,
        { style: styles.header },
        h(View, null, text(styles.title, l.title), text(styles.org, data.org.name), data.org.taxId === null ? null : text(styles.org, data.org.taxId)),
        h(View, null, text(styles.number, d.number), text(styles.org, l.statuses[d.status] ?? d.status)),
      ),
      banner,
      h(
        View,
        { style: styles.grid },
        field(l.customer, data.customer.name),
        field(l.taxId, data.customer.taxId),
        field(l.address, data.customer.address),
        field(l.source, source),
        field(l.issuedAt, date(d.issuedAt)),
        field(l.dueAt, date(d.dueAt)),
        field(l.paidAt, date(d.paidAt)),
        field(l.nfe, d.nfeNumber),
        d.nfeKey === null ? null : field(l.nfeKey, d.nfeKey),
      ),
      h(View, { style: styles.head }, text(styles.colWide, l.description), text(styles.col, l.quantity), text(styles.col, l.unit), text(styles.col, l.amount)),
      ...d.lines.map((line, index) =>
        h(
          View,
          { key: String(index), style: styles.row, wrap: false },
          text(styles.colWide, line.description),
          text(styles.col, qty(line.quantity)),
          text(styles.col, money(line.unitAmountCents)),
          text(styles.col, money(line.amountCents)),
        ),
      ),
      h(
        View,
        { style: styles.totals },
        total(l.subtotal, money(d.subtotalCents)),
        d.discountCents === 0 ? null : total(l.discount, `− ${money(d.discountCents)}`),
        total(l.total, money(d.totalCents), true),
      ),
      d.notes === null ? null : h(View, { style: styles.notes }, text({ fontFamily: "Helvetica-Bold" }, l.notes), text(undefined, d.notes)),
      h(
        View,
        { style: styles.footer, fixed: true },
        text(undefined, `${l.generated} ${new Intl.DateTimeFormat(data.locale, { dateStyle: "short", timeStyle: "short", timeZone: data.timeZone }).format(data.generatedAt)}`),
        text(undefined, d.number),
      ),
    ),
  );
  const buffer = await renderToBuffer(tree as unknown as Parameters<typeof renderToBuffer>[0]);
  return new Uint8Array(buffer);
}
