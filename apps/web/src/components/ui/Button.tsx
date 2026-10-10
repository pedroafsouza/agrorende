import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Campo claro buttons: 48 px minimum (56 px for the screen's primary action), icon together with text. */
export const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-controls px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--ar-focus)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[var(--ar-primary)] text-[var(--ar-on-primary)] hover:bg-[var(--ar-primary-hover)] [&:disabled:not([aria-busy=true])]:bg-[var(--ar-surface-muted)] [&:disabled:not([aria-busy=true])]:text-[var(--ar-text-muted)] [&:disabled:not([aria-busy=true])]:opacity-100",
        secondary: "border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] text-[var(--ar-text)] hover:bg-[var(--ar-surface-muted)]",
        ghost: "text-[var(--ar-text)] hover:bg-[var(--ar-surface-muted)]",
        danger: "bg-[var(--ar-danger)] text-[var(--ar-on-danger)] hover:opacity-90",
        link: "min-h-0 px-0 text-[var(--ar-link)] underline-offset-4 hover:underline",
      },
      size: {
        md: "",
        primary: "min-h-14 px-6 text-base",
        icon: "w-12 px-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  readonly icon?: ReactNode;
  /** The action is running: inline spinner, disabled, `aria-busy`, and the button keeps its width. */
  readonly pending?: boolean;
  /** @deprecated Use `pending`; kept as an alias for existing screens. */
  readonly busy?: boolean;
}

function Spinner({ className }: { readonly className?: string }) {
  return <span aria-hidden="true" className={cn("size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none motion-reduce:border-t-current/40", className)} data-testid="button-spinner" />;
}

export function Button({ className, variant, size, icon, pending = false, busy = false, children, type = "button", disabled, ...rest }: ButtonProps) {
  const isPending = pending || busy;
  const hasIcon = icon !== undefined && icon !== null && icon !== false;
  return (
    <button
      aria-busy={isPending}
      className={cn(buttonVariants({ variant, size }), isPending && "relative cursor-wait disabled:cursor-wait disabled:opacity-90", className)}
      data-pending={isPending ? "" : undefined}
      disabled={disabled === true || isPending}
      type={type}
      {...rest}
    >
      {/* While pending the spinner takes the icon's place, or floats over a hidden label, so the width never changes. */}
      {hasIcon ? (
        isPending ? (
          <span className="grid place-items-center [&>*]:[grid-area:1/1]">
            <span className="invisible inline-flex">{icon}</span>
            <Spinner />
          </span>
        ) : (
          icon
        )
      ) : null}
      {isPending && !hasIcon ? (
        <>
          <Spinner className="absolute inset-0 m-auto" />
          <span className="inline-flex items-center gap-2 opacity-0">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
