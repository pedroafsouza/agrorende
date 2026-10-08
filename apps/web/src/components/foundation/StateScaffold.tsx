import { useTranslations } from "next-intl";

interface PlaceholderPageProps {
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly route: string;
}

interface StateCardProps {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly variant: "loading" | "empty" | "error" | "offline";
}

const variantClassName = {
  loading: "border-graphite-200 bg-white",
  empty: "border-mata-700 bg-white",
  error: "border-danger bg-white",
  offline: "border-graphite-950 bg-white border-2",
} satisfies Record<StateCardProps["variant"], string>;

const retryIcon = "↻";

function StateCard({ titleKey, bodyKey, variant }: StateCardProps) {
  const t = useTranslations("web");

  return (
    <article className={`rounded-cards border p-4 ${variantClassName[variant]}`}>
      <p className="text-sm font-semibold text-graphite-900">{t(titleKey)}</p>
      <p className="mt-2 text-sm text-graphite-700">{t(bodyKey)}</p>
      <button className="mt-4 min-h-touch rounded-controls border border-mata-700 px-4 text-sm font-semibold text-mata-800" type="button">
        <span aria-hidden="true">{retryIcon}</span>
        <span className="ml-2">{t("common.retry")}</span>
      </button>
    </article>
  );
}

export function PlaceholderPage({ titleKey, descriptionKey, route }: PlaceholderPageProps) {
  const t = useTranslations("web");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <section className="rounded-cards border border-graphite-200 bg-white p-6">
        <p className="text-sm font-semibold text-mata-800">{t("common.foundationBadge")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-graphite-950">{t(titleKey)}</h1>
        <p className="mt-3 max-w-3xl text-base text-graphite-700">{t(descriptionKey)}</p>
        <dl className="mt-6 grid gap-3 text-sm text-graphite-700 sm:grid-cols-2">
          <div className="rounded-controls border border-graphite-200 p-3">
            <dt className="font-semibold text-graphite-900">{t("common.route")}</dt>
            <dd className="mt-1 font-mono">{route}</dd>
          </div>
          <div className="rounded-controls border border-graphite-200 p-3">
            <dt className="font-semibold text-graphite-900">{t("common.status")}</dt>
            <dd className="mt-1">{t("common.notImplemented")}</dd>
          </div>
        </dl>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <StateCard bodyKey="common.loading.body" titleKey="common.loading.title" variant="loading" />
        <StateCard bodyKey="common.empty.body" titleKey="common.empty.title" variant="empty" />
        <StateCard bodyKey="common.error.body" titleKey="common.error.title" variant="error" />
        <StateCard bodyKey="common.offline.body" titleKey="common.offline.title" variant="offline" />
      </section>
    </main>
  );
}
