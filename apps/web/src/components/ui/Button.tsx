import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Campo claro buttons: 48 px minimum (56 px for the screen's primary action), icon together with text. */
export const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-controls px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--ar-focus)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[var(--ar-primary)] text-[var(--ar-on-primary)] hover:bg-[var(--ar-primary-hover)]",
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
  readonly busy?: boolean;
}

export function Button({ className, variant, size, icon, busy = false, children, type = "button", disabled, ...rest }: ButtonProps) {
  return (
    <button aria-busy={busy} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled === true || busy} type={type} {...rest}>
      {busy ? <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}
