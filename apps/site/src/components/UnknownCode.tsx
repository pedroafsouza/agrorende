"use client";

import { type ReactNode, useEffect, useState } from "react";

/** Reads `?code=` from the address (EC-SITE-07). Shown as text only and capped at 64 characters. */
function useCodeParam(): string {
  const [code, setCode] = useState("");
  useEffect(() => {
    setCode((new URLSearchParams(window.location.search).get("code") ?? "").slice(0, 64));
  }, []);
  return code;
}

export function UnknownCodeNote({ label }: { readonly label: string }) {
  const code = useCodeParam();
  if (code.length === 0) return null;
  return (
    <p className="mt-4">
      {label}{" "}
      <code className="rounded-[4px] bg-surface-strong px-1.5 py-0.5 font-mono" data-unknown-code="true">
        {code}
      </code>
    </p>
  );
}

/** A link to the help search that carries the unknown code as `?q=` once the page is interactive. */
export function HelpSearchLink({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const code = useCodeParam();
  const [path, hash] = href.split("#");
  const target = code.length === 0 ? href : `${path}?q=${encodeURIComponent(code)}${hash === undefined ? "" : `#${hash}`}`;
  return (
    <a href={target} className={className} data-help-search="true">
      {children}
    </a>
  );
}
