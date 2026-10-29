import { History, LogOut, PenLine, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";

const navigation = [
  { href: "/dashboard", label: "Write", icon: PenLine },
  { href: "/history", label: "History", icon: History },
  { href: "/memory", label: "Memory", icon: Sparkles },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-4 py-4 lg:px-5 lg:py-6">
          <div className="flex items-center justify-between lg:block">
            <Brand />
            <nav className="flex items-center gap-1 lg:mt-10 lg:block lg:space-y-1">
              {navigation.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-ink/5 hover:text-ink"
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              ))}
            </nav>
          </div>
          <div className="mt-auto hidden space-y-1 lg:block">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Settings2 className="size-4" /> Settings
            </Link>
            <form action="/auth/signout" method="post">
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-ink/5 hover:text-ink">
                <LogOut className="size-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
