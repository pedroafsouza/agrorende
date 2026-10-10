import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { ReportImage, WorkOrderReportLabels, WorkOrderReportModel } from "../modules/workOrders/report";

const colors = { ink: "#1F2A1F", muted: "#5B665B", line: "#D5DBD0", band: "#EEF2EA", accent: "#2F6B3A", danger: "#A3361F" };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, color: colors.ink, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: colors.accent, paddingBottom: 8, marginBottom: 12 },
  org: { fontSize: 10, color: colors.muted },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  number: { fontSize: 12, fontFamily: "Helvetica-Bold", color: colors.accent, textAlign: "right" },
  small: { fontSize: 8, color: colors.muted },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", backgroundColor: colors.band, padding: 4, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingVertical: 2, flexDirection: "row" },
  label: { width: 90, color: colors.muted },
  value: { flex: 1 },
  paragraph: { marginBottom: 4, lineHeight: 1.35 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.line, paddingVertical: 3 },
  colWide: { flex: 3 },
  col: { flex: 1, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  fail: { color: colors.danger, fontFamily: "Helvetica-Bold" },
  photos: { flexDirection: "row", flexWrap: "wrap" },
  photo: { width: 120, marginRight: 8, marginBottom: 8 },
  photoImage: { width: 120, height: 90, objectFit: "cover" },
  signature: { width: 180, height: 70, objectFit: "contain", borderBottomWidth: 0.5, borderBottomColor: colors.ink },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: colors.muted },
});

/** Opaque React element; only `@react-pdf/renderer` looks inside. */
interface El {
  readonly type: unknown;
  readonly props: unknown;
}
type Child = El | string | null;
type CreateElement = (type: unknown, props: Record<string, unknown> | null, ...children: Child[]) => El;

/**
 * `@react-pdf/renderer` needs React elements. Core's lint forbids importing React statically and its tsconfig
 * has no JSX (change request T07-004), so the elements are built with `createElement` from a lazy import.
 */
async function loadCreateElement(): Promise<CreateElement> {
  const react = (await import("react")) as unknown as { createElement: CreateElement };
  return react.createElement;
}

export function formatReportDate(iso: string | null, model: Pick<WorkOrderReportModel, "locale" | "timezone">): string {
  if (iso === null) return "—";
  return new Intl.DateTimeFormat(model.locale, { dateStyle: "short", timeStyle: "short", timeZone: model.timezone }).format(new Date(iso));
}

export function formatReportMoney(cents: number | null, model: Pick<WorkOrderReportModel, "locale" | "currency">): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat(model.locale, { style: "currency", currency: model.currency }).format(cents / 100);
}

/** Renders the WO-24 PDF. Pure apart from React; the model is already permission-filtered. */
export async function renderWorkOrderReport(model: WorkOrderReportModel, labels: WorkOrderReportLabels): Promise<Uint8Array> {
  const h = await loadCreateElement();
  const text = (style: object | object[] | undefined, value: string | number | null): El => h(Text, { style }, value === null || value === "" ? "—" : String(value));
  const field = (label: string, value: string | number | null): El => h(View, { style: styles.cell }, text(styles.label, label), text(styles.value, value));
  const section = (title: string, ...children: Child[]): El => h(View, { style: styles.section, wrap: true }, text(styles.sectionTitle, title), ...children);
  const date = (iso: string | null): string => formatReportDate(iso, model);
  const money = (cents: number | null): string => formatReportMoney(cents, model);
  const minutes = (value: number | null): string | null => (value === null ? null : `${value} ${labels.minutesSuffix}`);
  const number = (value: number): string => new Intl.NumberFormat(model.locale, { maximumFractionDigits: 2 }).format(value);
  const image = (img: ReportImage, style: object): El => h(Image, { style, src: { data: Buffer.from(img.data), format: img.format } });

  const paragraphs = [
    model.description === null ? null : h(View, { key: "d" }, text(styles.bold, labels.description), text(styles.paragraph, model.description)),
    model.resolution === null ? null : h(View, { key: "r" }, text(styles.bold, labels.resolution), text(styles.paragraph, model.resolution)),
    model.rootCause === null ? null : h(View, { key: "c" }, text(styles.bold, labels.rootCause), text(styles.paragraph, model.rootCause)),
  ].filter((child): child is El => child !== null);

  const checklist =
    model.checklist.length === 0
      ? null
      : section(
          labels.checklist,
          ...model.checklist.map((row) =>
            h(
              View,
              { key: row.key, style: styles.row, wrap: false },
              h(Text, { style: styles.colWide }, row.isSafetyCritical ? `${row.label} · ${labels.safetyCritical}` : row.label, row.note === null ? "" : `\n${row.note}`),
              text(row.value === "FAIL" ? [styles.col, styles.fail] : styles.col, row.value === null ? labels.none : labels.enumLabel("checklistValue", row.value)),
            ),
          ),
        );

  const parts =
    model.parts.length === 0
      ? null
      : section(
          labels.parts,
          h(View, { style: styles.row }, text([styles.colWide, styles.bold], labels.partName), text([styles.col, styles.bold], labels.quantity), model.costs === null ? null : text([styles.col, styles.bold], labels.unitCost)),
          ...model.parts.map((part, index) =>
            h(
              View,
              { key: `p${index}`, style: styles.row, wrap: false },
              text(styles.colWide, part.name),
              text(styles.col, `${number(part.quantity)} ${part.unit}`),
              model.costs === null ? null : text(styles.col, money(part.unitCostCents)),
            ),
          ),
        );

  const costs =
    model.costs === null
      ? null
      : (() => {
          const { laborCents, partsCents, externalCents } = model.costs;
          const total = (laborCents ?? 0) + (partsCents ?? 0) + (externalCents ?? 0);
          const line = (label: string, value: string, bold = false): El => h(View, { key: label, style: styles.row }, text(bold ? [styles.colWide, styles.bold] : styles.colWide, label), text(bold ? [styles.col, styles.bold] : styles.col, value));
          return section(
            labels.costs,
            laborCents === null ? null : line(labels.labor, money(laborCents)),
            line(labels.partsCost, money(partsCents)),
            externalCents === null ? null : line(labels.external, money(externalCents)),
            line(labels.total, money(total), true),
          );
        })();

  const photos =
    model.photoCount === 0
      ? null
      : section(
          labels.photos,
          h(
            View,
            { style: styles.photos },
            ...model.photos.map((photo, index) =>
              h(View, { key: `ph${index}`, style: styles.photo, wrap: false }, image(photo, styles.photoImage), text(styles.small, `${labels.enumLabel("mediaTag", photo.tag)} · ${date(photo.capturedAt)}`)),
            ),
          ),
          model.photoCount > model.photos.length ? text(styles.small, labels.morePhotos.replace("{count}", String(model.photoCount - model.photos.length))) : null,
        );

  const signature = section(
    labels.signature,
    model.signature.image === null ? null : image(model.signature.image, styles.signature),
    h(View, { style: styles.grid }, field(labels.status, model.signature.status === null ? null : labels.enumLabel("signatureStatus", model.signature.status)), field(labels.signer, model.signature.signerName)),
    model.signature.witnessName === null ? null : h(View, { style: styles.grid }, field(labels.witness, model.signature.witnessName)),
    model.signature.reason === null ? null : h(View, { style: styles.grid }, field(labels.signatureReason, model.signature.reason)),
  );

  const timeline =
    model.timeline.length === 0
      ? null
      : section(
          labels.timeline,
          ...model.timeline.map((entry, index) =>
            h(
              View,
              { key: `t${index}`, style: styles.row, wrap: false },
              text(styles.col, date(entry.occurredAt)),
              text(styles.colWide, `${entry.toStatus === null ? entry.action : labels.enumLabel("workOrderStatus", entry.toStatus)}${entry.actorName === null ? "" : ` · ${entry.actorName}`}`),
            ),
          ),
        );

  const doc = h(
    Document,
    { title: `${model.number} · ${model.title}`, language: model.locale, author: model.organizationName },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(
        View,
        { style: styles.header },
        h(View, null, text(styles.org, model.organizationName), text(styles.title, labels.title), text(styles.value, model.title)),
        h(View, null, text(styles.number, `${labels.number} ${model.number}`), text([styles.small, { textAlign: "right" }], `${labels.generatedAt} ${date(model.generatedAt)}`)),
      ),
      h(
        View,
        { style: styles.grid },
        field(labels.asset, model.assetName === null ? null : model.assetCode === null ? model.assetName : `${model.assetName} (${model.assetCode})`),
        field(labels.customer, model.customerName),
        field(labels.site, model.siteName),
        field(labels.assignee, model.assigneeName),
        field(labels.type, labels.enumLabel("workOrderType", model.type)),
        field(labels.priority, labels.enumLabel("priority", model.priority)),
        field(labels.status, labels.enumLabel("workOrderStatus", model.status)),
        field(labels.hourMeter, model.hourMeterReading === null ? null : number(model.hourMeterReading)),
        field(labels.createdAt, date(model.createdAt)),
        field(labels.startedAt, date(model.startedAt)),
        field(labels.completedAt, date(model.completedAt)),
        field(labels.verifiedAt, model.verifiedAt === null ? null : `${date(model.verifiedAt)}${model.verifiedByName === null ? "" : ` · ${model.verifiedByName}`}`),
        field(labels.travelTime, minutes(model.travelMinutes)),
        field(labels.workTime, minutes(model.workMinutes)),
      ),
      paragraphs.length === 0 ? null : h(View, { style: styles.section }, ...paragraphs),
      checklist,
      parts,
      costs,
      photos,
      signature,
      timeline,
      h(View, { style: styles.footer, fixed: true }, text(undefined, `${model.organizationName} · ${model.number}`), h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber}/${totalPages}` })),
    ),
  );
  const buffer = await renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]);
  return new Uint8Array(buffer);
}
