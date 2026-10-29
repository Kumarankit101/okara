"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

function NavigationStatus({ label }: { label: string }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        aria-hidden="true"
        className={`ml-auto size-1.5 shrink-0 rounded-full bg-current transition-opacity ${
          pending ? "opacity-60 motion-safe:animate-pulse" : "opacity-0"
        }`}
      />
      {pending ? (
        <>
          <span className="sr-only" role="status">
            Loading {label}
          </span>
          <span
            aria-hidden="true"
            className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-accent-soft"
          >
            <span className="block h-full w-1/3 bg-forest motion-safe:animate-[navigation-progress_900ms_ease-in-out_infinite]" />
          </span>
        </>
      ) : null}
    </>
  );
}

export function NavigationLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-forest text-white shadow-sm"
          : "text-muted hover:bg-ink/5 hover:text-ink"
      }`}
    >
      {children}
      <NavigationStatus label={label} />
    </Link>
  );
}
