import { useTranslations } from "next-intl";

/** Non-production ribbon so screenshots and demos never pass for production (A§18.1). */
export function EnvRibbon({ appEnv }: { readonly appEnv: "local" | "ci" | "staging" | "production" }) {
  const t = useTranslations("admin");
  if (appEnv === "production") return null;
  return (
    <div className="bg-[var(--ar-ribbon)] px-4 py-1 text-center text-xs font-bold uppercase tracking-wider text-white" role="note">
      {t(`shell.env.${appEnv}`)}
    </div>
  );
}
