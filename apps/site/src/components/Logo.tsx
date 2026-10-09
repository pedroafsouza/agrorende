interface LogoProps {
  readonly name: string;
  readonly label: string;
  readonly href: string;
}

/** The wheel-arrow mark with the wordmark. The mark is decorative; the link carries the name. */
export function Logo({ name, label, href }: LogoProps) {
  return (
    <a href={href} aria-label={label} className="inline-flex min-h-12 items-center gap-2.5 no-underline">
      <img src="/icon.svg" alt="" width={36} height={36} className="size-9" />
      <span aria-hidden="true" className="text-xl font-bold tracking-tight">
        {name}
      </span>
    </a>
  );
}
