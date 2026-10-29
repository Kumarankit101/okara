import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-[-0.03em] text-ink",
        className,
      )}
      aria-label="Okara home"
    >
      <span className="grid size-8 place-items-center rounded-full bg-forest text-sm font-bold text-accent">
        O
      </span>
      <span className="text-xl">okara</span>
    </Link>
  );
}
