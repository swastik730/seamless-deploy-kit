import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, BookOpen, Boxes, Cloud, CloudOff, GraduationCap, Home, Loader2, LayoutGrid, Moon, PenLine, ShieldCheck, Sparkles, Sun, Timer, TrendingUp, User } from "lucide-react";
import type { ReactNode } from "react";
import logoUrl from "@/assets/logo.webp";
import { AdBanner, AdInterstitial } from "@/components/ads/AdManager";
import { OfflineBar } from "@/components/OfflineBar";
import { useAppLogo } from "@/lib/branding";
import { useTheme } from "./theme";
import { useSession } from "@/lib/auth";
import { useAppState, useSyncStatus } from "@/lib/store";
import { cn } from "@/lib/utils";


/** Full navigation — desktop sidebar. */
const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/practice", label: "Practice", icon: PenLine },
  { to: "/tests", label: "Tests", icon: Timer },
  { to: "/exam", label: "Exam Hub", icon: ShieldCheck },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/more", label: "More", icon: LayoutGrid },
] as const;

/** Phone bottom bar — six tabs so every target stays thumb-sized. */
const MOBILE_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/practice", label: "Practice", icon: PenLine },
  { to: "/tests", label: "Tests", icon: Timer },
  { to: "/exam", label: "Exam", icon: ShieldCheck },
  { to: "/more", label: "More", icon: LayoutGrid },
] as const;


export function BrandMark({ className }: { className?: string }) {
  const customLogo = useAppLogo();
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={customLogo ?? logoUrl}
        alt="BoardBuddy logo"
        width={32}
        height={32}
        className="h-8 w-8 rounded-xl object-cover shadow-sm"
      />
      <span className="text-lg font-extrabold tracking-tight">
        Board<span className="text-primary">Buddy</span>
      </span>
    </span>
  );
}


export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { theme, toggle } = useTheme();
  const { user } = useSession();
  const sync = useSyncStatus();
  const state = useAppState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col lg:max-w-7xl lg:flex-row lg:gap-8 lg:px-6 2xl:max-w-[1680px] 2xl:gap-12 2xl:px-12">
      {/* Desktop / laptop sidebar — hidden on phones and tablets */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:gap-1 lg:py-6">
        <Link to="/" className="mb-4 px-2">
          <BrandMark />
        </Link>
        <nav>
          <ul className="space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    preload="render"
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto space-y-1">
          <Link
            to="/tutor"
            preload="render"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <GraduationCap className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">AI Tutor</span>
          </Link>
          <Link
            to="/models"
            preload="render"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Boxes className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">3D Models</span>
          </Link>
          <Link
            to="/subscribe"
            preload="render"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-hero-amber transition-colors hover:bg-muted"
          >
            <Sparkles className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">Premium Plans</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-lg lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-0 lg:py-6">

          {title ? (
            <h1 className="min-w-0 truncate text-lg font-bold tracking-tight lg:text-2xl">{title}</h1>
          ) : (
            <Link to="/" className="min-w-0 lg:invisible">
              <BrandMark />
            </Link>
          )}
          <div className="flex shrink-0 items-center gap-1">

            <span
              title={user ? (sync === "syncing" ? "Syncing…" : sync === "error" ? "Sync failed" : "Synced to cloud") : "Not signed in — progress is on this device"}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
            >
              {!user ? (
                <CloudOff className="h-[18px] w-[18px]" />
              ) : sync === "syncing" ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin text-primary" />
              ) : (
                <Cloud className={cn("h-[18px] w-[18px]", sync === "error" ? "text-destructive" : "text-success")} />
              )}
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <Link
              to="/tutor"
              preload="render"
              aria-label="AI doubt tutor"
              className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:grid"
            >
              <GraduationCap className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to="/models"
              preload="render"
              aria-label="3D science models"
              className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:grid"
            >
              <Boxes className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to="/subscribe"
              preload="render"
              aria-label="Plans and pricing"
              className="grid h-9 w-9 place-items-center rounded-full text-hero-amber transition-colors hover:bg-muted"
            >
              <Sparkles className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to="/notifications"
              preload="render"
              aria-label="Notifications"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-[18px] w-[18px]" />
            </Link>

            <Link
              to="/profile"
              preload="render"
              aria-label="Profile"
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {state.avatarUrl ? (
                <img
                  src={state.avatarUrl}
                  alt="Your profile"
                  width={512}
                  height={512}
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-9 object-cover"
                />
              ) : (
                <User className="h-[18px] w-[18px]" />
              )}
            </Link>

          </div>
        </div>
        <OfflineBar />
      </header>

      <main className="flex-1 px-4 pb-28 pt-4 lg:px-0 lg:pb-12">{children}</main>

      <AdInterstitial />

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t border-border/70 bg-card/95 shadow-[var(--shadow-float)] backdrop-blur-lg lg:hidden">
        <AdBanner />

        <ul className="grid grid-cols-6">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  preload="render"
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-12 place-items-center rounded-full transition-colors",
                      active && "bg-primary-soft",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="hidden lg:block">
        <AdBanner />
      </div>
      </div>
    </div>

  );
}
