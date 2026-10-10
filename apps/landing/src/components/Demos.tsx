import { Pause } from "lucide-react";
import { type ReactNode } from "react";

import { getTranslator, splitList, type Translator } from "@/i18n/messages";
import { type SiteLocale } from "@/lib/locales";

import { container, sectionTitle } from "./ui";

/*
 * Animated product demos for the home page. Each one is an inline SVG driven by CSS keyframes in
 * globals.css (`.demo` rules), so it needs no JavaScript, no video file and no network request,
 * follows the light or dark theme and is translated like any other copy. The default styles are
 * the final frame: with reduced motion, or when animation is unavailable, visitors see the end
 * state of each story. The pause button (wired by the body script) stops every loop at once.
 */

function Frame({ title, body, children }: { readonly title: string; readonly body: string; readonly children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-4">
      <div className="demo-frame overflow-hidden rounded-[12px] border border-border bg-surface">
        {children}
        <div aria-hidden="true" className="demo-progress h-1 bg-border">
          <span className="block h-full origin-left bg-brand" />
        </div>
      </div>
      <figcaption>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-1 text-fg-muted">{body}</p>
      </figcaption>
    </figure>
  );
}

function Svg({ children }: { readonly children: ReactNode }) {
  return (
    <svg viewBox="0 0 360 260" className="block h-auto w-full" aria-hidden="true" focusable="false">
      <g className="d-scene">{children}</g>
    </svg>
  );
}

function Check({ x, y }: { readonly x: number; readonly y: number }) {
  return <path d={`M${x + 2.5} ${y + 6.5} l2.5 2.5 l5 -6`} className="d-stroke-ok" />;
}

function FieldToOffice({ t }: { readonly t: Translator }) {
  const rows = [
    { y: 86, label: t("home.demo.tyres"), cls: "in-8", defect: false },
    { y: 106, label: t("home.demo.hydraulics"), cls: "in-14", defect: true },
    { y: 126, label: t("home.demo.engine"), cls: "in-20", defect: false },
  ];
  return (
    <Svg>
      <rect x="12" y="14" width="124" height="232" rx="18" className="d-device" />
      <text x="24" y="36" className="d-xs d-muted out-55">
        {t("home.demo.noSignal")}
      </text>
      <text x="24" y="36" className="d-xs d-b d-t-ok in-55">
        {t("home.demo.signal")}
      </text>
      <text x="24" y="56" className="d-md d-b">
        {t("home.demo.inspection")}
      </text>
      <text x="24" y="70" className="d-sm d-muted">
        {t("home.demo.asset")}
      </text>
      {rows.map((row) => (
        <g key={row.y}>
          <rect x="24" y={row.y - 9} width="12" height="12" rx="3" className="d-box" />
          <text x="42" y={row.y + 1} className="d-sm">
            {row.label}
          </text>
          <g className={row.cls}>
            {row.defect ? <path d={`M27 ${row.y - 6} l6 6 m0 -6 l-6 6`} className="d-stroke-bad" /> : <Check x={24} y={row.y - 9} />}
          </g>
        </g>
      ))}
      <rect x="24" y="140" width="100" height="52" rx="6" className="d-strong" />
      <g className="out-30">
        <rect x="64" y="158" width="20" height="14" rx="3" className="d-box" />
        <circle cx="74" cy="165" r="4" className="d-box" />
      </g>
      <g className="in-30">
        <path d="M74 152 c6 9 10 14 10 19 a10 10 0 0 1 -20 0 c0 -5 4 -10 10 -19z" className="d-fill-bad" />
        <path d="M24 184 h100" className="d-stroke-line" />
      </g>
      <rect x="24" y="140" width="100" height="52" rx="6" className="d-flash flash-28" />
      <g className="win-36-55">
        <rect x="20" y="206" width="108" height="22" rx="11" className="d-chip d-chip-warn" />
        <text x="74" y="221" textAnchor="middle" className="d-xs d-b d-t-warn">
          {t("home.demo.saved")}
        </text>
      </g>
      <g className="win-55-62">
        <rect x="20" y="206" width="108" height="22" rx="11" className="d-chip d-chip-info" />
        <text x="74" y="221" textAnchor="middle" className="d-xs d-b d-t-info">
          {t("home.demo.sending")}
        </text>
      </g>
      <g className="in-62">
        <rect x="20" y="206" width="108" height="22" rx="11" className="d-chip d-chip-ok" />
        <text x="74" y="221" textAnchor="middle" className="d-xs d-b d-t-ok">
          {t("home.demo.sent")}
        </text>
      </g>

      <rect x="146" y="40" width="202" height="190" rx="10" className="d-device" />
      <path d="M146 64 H348" className="d-stroke-line" />
      <circle cx="158" cy="52" r="2.5" className="d-fill-muted" />
      <circle cx="166" cy="52" r="2.5" className="d-fill-muted" />
      <circle cx="174" cy="52" r="2.5" className="d-fill-muted" />
      <text x="186" y="56" className="d-sm d-b">
        {t("home.demo.attention")}
      </text>
      <g className="d1-rows">
        <rect x="154" y="114" width="186" height="34" rx="6" className="d-strong" />
        <rect x="154" y="114" width="4" height="34" rx="2" className="d-fill-warn" />
        <text x="166" y="128" className="d-sm d-b">
          {t("home.demo.overdueAsset")}
        </text>
        <text x="166" y="141" className="d-xs d-muted">
          {t("home.demo.overdue")}
        </text>
        <rect x="154" y="154" width="186" height="34" rx="6" className="d-strong" />
        <rect x="154" y="154" width="4" height="34" rx="2" className="d-fill-info" />
        <text x="166" y="168" className="d-sm d-b">
          {t("home.demo.rentalId")}
        </text>
        <text x="166" y="181" className="d-xs d-muted">
          {t("home.demo.rentalDue")}
        </text>
      </g>
      <g className="d1-new">
        <rect x="154" y="74" width="186" height="34" rx="6" className="d-strong d1-ring" />
        <rect x="154" y="74" width="4" height="34" rx="2" className="d-fill-bad" />
        <text x="166" y="88" className="d-sm d-b">
          {t("home.demo.asset")}
        </text>
        <text x="166" y="101" className="d-xs d-muted">
          {t("home.demo.leak")}
        </text>
        <rect x="284" y="82" width="48" height="18" rx="9" className="d-chip d-chip-bad" />
        <text x="308" y="94.5" textAnchor="middle" className="d-xs d-b d-t-bad">
          {t("home.demo.critical")}
        </text>
      </g>
      <path d="M124 217 L154 91" className="d-stroke-ok d-dash" />
      <circle cx="124" cy="217" r="4" className="d-fill-ok d1-packet" />
    </Svg>
  );
}

function WorkOrder({ t }: { readonly t: Translator }) {
  const columns = [t("home.demo.colOpen"), t("home.demo.colAssigned"), t("home.demo.colField"), t("home.demo.colDone")];
  return (
    <Svg>
      {columns.map((label, i) => (
        <g key={label}>
          <text x={10 + i * 88} y="24" className="d-xs d-b d-muted">
            {label}
          </text>
          <rect x={6 + i * 88} y="32" width="84" height="220" rx="8" className="d-strong" />
          <rect x={10 + i * 88} y={i % 2 === 0 ? 204 : 196} width="76" height="40" rx="6" className="d-device d-ghost" />
        </g>
      ))}
      <g className="d2-card">
        <rect x="10" y="40" width="76" height="148" rx="6" className="d-device" />
        <rect x="10" y="40" width="4" height="148" rx="2" className="d2-bar" />
        <text x="20" y="57" className="d-xs d-b d-muted">
          {t("home.demo.woNumber")}
        </text>
        <text x="20" y="72" className="d-sm d-b">
          {t("home.demo.woTitle1")}
        </text>
        <text x="20" y="84" className="d-sm d-b">
          {t("home.demo.woTitle2")}
        </text>
        <g className="in-20">
          <circle cx="27" cy="101" r="7" className="d-fill-ok" />
          <text x="27" y="104.5" textAnchor="middle" className="d-xs d-b d-t-on">
            {t("home.demo.assigneeInitial")}
          </text>
          <text x="38" y="104.5" className="d-xs">
            {t("home.demo.assignee")}
          </text>
        </g>
        <g className="in-44">
          <circle cx="24" cy="120" r="4.5" className="d-box" />
          <path d="M24 117.5 v2.5 l1.8 1.2" className="d-stroke-muted" />
          <text x="33" y="123" className="d-xs d-muted">
            {t("home.demo.duration")}
          </text>
        </g>
        <path d="M20 146 c4 -12 8 6 12 -4 s6 -8 10 2 s8 -6 12 -2 s6 4 10 -2" className="d-stroke-fg d2-sign" />
        <path d="M20 150 H80" className="d-stroke-line" />
        <text x="20" y="160" className="d-xs d-muted in-66">
          {t("home.demo.signature")}
        </text>
        <text x="20" y="179" className="d-md d-b in-74">
          {t("home.demo.cost")}
        </text>
        <g className="in-66">
          <circle cx="76" cy="54" r="7" className="d-fill-ok" />
          <path d="M72.5 54 l2.5 2.5 l4 -4.5" className="d-stroke-on" />
        </g>
      </g>
    </Svg>
  );
}

const COST_BARS: readonly (readonly [number, number, number])[] = [
  [38, 26, 10],
  [52, 28, 14],
  [64, 30, 12],
  [58, 30, 62],
  [70, 32, 16],
  [46, 28, 12],
];

function CostPerHour({ t }: { readonly t: Translator }) {
  const months = splitList(t("home.demo.months"));
  const legend = [
    { label: t("home.demo.fuel"), cls: "d-seg-fuel" },
    { label: t("home.demo.labour"), cls: "d-seg-labour" },
    { label: t("home.demo.parts"), cls: "d-seg-parts" },
  ];
  return (
    <Svg>
      <text x="16" y="28" className="d-md d-b">
        {t("home.demo.tractor")}
      </text>
      <text x="16" y="44" className="d-xs d-muted">
        {t("home.demo.costSubtitle")}
      </text>
      <path d="M16 222 H222" className="d-stroke-line" />
      {COST_BARS.map(([fuel, labour, parts], i) => {
        const x = 22 + i * 34;
        return (
          <g key={x}>
            <g className={`d3-bar d3-bar-${i}`}>
              <rect x={x} y={222 - fuel} width="22" height={fuel} className="d-seg-fuel" />
              <rect x={x} y={222 - fuel - labour} width="22" height={labour} className="d-seg-labour" />
              <rect x={x} y={222 - fuel - labour - parts} width="22" height={parts} rx="2" className="d-seg-parts" />
            </g>
            <text x={x + 11} y="238" textAnchor="middle" className="d-xs d-muted">
              {months[i]}
            </text>
          </g>
        );
      })}
      <g className="in-44">
        <path d="M124 66 H146" className="d-stroke-fg" />
        <text x="135" y="60" textAnchor="middle" className="d-xs d-b">
          {t("home.demo.repair")}
        </text>
      </g>
      {legend.map((item, i) => (
        <g key={item.cls}>
          <rect x="238" y={68 + i * 20} width="10" height="10" rx="2" className={item.cls} />
          <text x="254" y={77 + i * 20} className="d-xs">
            {item.label}
          </text>
        </g>
      ))}
      <g className="in-64">
        <text x="238" y="170" className="d-xl d-b d-t-brand">
          {t("home.demo.perHourValue")}
        </text>
        <text x="238" y="188" className="d-xs">
          {t("home.demo.perHour")}
        </text>
        <text x="238" y="204" className="d-xs d-muted">
          {t("home.demo.hourMeter")}
        </text>
      </g>
    </Svg>
  );
}

/** "See AgroRende at work": three looping, translated, theme-aware product demos. */
export function Demos({ locale }: { readonly locale: SiteLocale }) {
  const t = getTranslator(locale);
  return (
    <section className={`${container} py-20`} aria-labelledby="demos-title" data-testid="demos">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="demos-title" className={sectionTitle}>
            {t("home.demosTitle")}
          </h2>
          <p className="mt-4 text-lg text-fg-muted">{t("home.demosLead")}</p>
        </div>
        <button
          type="button"
          aria-pressed="false"
          suppressHydrationWarning
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[8px] border-2 border-border px-4 font-semibold hover:border-fg"
          data-demo-toggle="true"
        >
          <Pause aria-hidden="true" className="size-5" />
          {t("home.demosPause")}
        </button>
      </div>
      <div className="demo mt-10 grid gap-10 lg:grid-cols-3">
        <Frame title={t("home.demo1Title")} body={t("home.demo1Body")}>
          <FieldToOffice t={t} />
        </Frame>
        <Frame title={t("home.demo2Title")} body={t("home.demo2Body")}>
          <WorkOrder t={t} />
        </Frame>
        <Frame title={t("home.demo3Title")} body={t("home.demo3Body")}>
          <CostPerHour t={t} />
        </Frame>
      </div>
    </section>
  );
}
