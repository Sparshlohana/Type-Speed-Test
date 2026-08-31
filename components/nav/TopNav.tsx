"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSettings } from "@/hooks/useSettings";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { initialsOf } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Test", mobileLabel: "Test" },
  { href: "/practice", label: "Practice", mobileLabel: "Practice" },
  { href: "/daily", label: "Daily", mobileLabel: "Daily" },
  { href: "/games", label: "Games", mobileLabel: "Games" },
  { href: "/leaderboard", label: "Leaderboard", mobileLabel: "Ranks" },
  { href: "/stats", label: "Stats", mobileLabel: "Stats" },
  { href: "/settings", label: "Settings", mobileLabel: "Settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { data: session, isPending } = useSession();
  const user = session?.user;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="TypeFlow home">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-white transition-transform duration-200 ease-[var(--ease)] group-hover:scale-105"
            >
              T
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-text">TypeFlow</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ease-[var(--ease)] ${
                    active ? "bg-surface text-text" : "text-sub hover:bg-surface hover:text-text"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (user) void signOut();
                else void signIn.social({ provider: "google" });
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
            >
              {user ? "Sign out" : "Sign in"}
            </button>
            <Link
              href="/settings"
              aria-label={user ? `${user.name}'s profile` : "Your profile"}
              className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-border bg-surface text-[11px] font-semibold text-sub transition-colors duration-200 ease-[var(--ease)] hover:border-accent hover:text-accent"
              style={
                user?.image
                  ? {
                      backgroundImage: `url(${user.image})`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            >
              {user?.image ? (
                <span className="sr-only">{user.name}</span>
              ) : (
                initialsOf(user?.name || settings.username)
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Small screens get the sections as a bottom bar instead. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-border bg-bg/90 backdrop-blur-md sm:hidden"
      >
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`min-w-[3.25rem] flex-1 py-3 text-center text-[11px] font-medium transition-colors duration-200 ease-[var(--ease)] ${
                active ? "text-accent" : "text-sub"
              }`}
            >
              {link.mobileLabel}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
