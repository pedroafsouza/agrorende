interface LogoProps {
  /** Kept for callers; the lettering is part of the SVG. */
  readonly name: string;
  readonly label: string;
  readonly href: string;
}

/** The AgroRende logo (gear-and-leaf symbol with outlined lettering). The link carries the accessible name. */
export function Logo({ label, href }: LogoProps) {
  return (
    <a href={href} aria-label={label} className="inline-flex min-h-12 items-center gap-2.5 no-underline">
      <img src="/brand/agrorende-logo.svg" alt="" width={185} height={40} className="logo-light h-10 w-auto" />
      <img src="/brand/agrorende-logo-dark.svg" alt="" width={185} height={40} className="logo-dark h-10 w-auto" />
    </a>
  );
}
