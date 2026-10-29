import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-forest text-white hover:bg-forest-deep disabled:bg-muted/60 shadow-[0_8px_24px_rgba(23,75,53,0.18)]",
  secondary:
    "border border-line bg-surface text-ink hover:border-ink/30 hover:bg-white",
  ghost: "text-muted hover:bg-ink/5 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-90",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
