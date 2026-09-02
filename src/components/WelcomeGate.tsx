import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, CloudUpload, LineChart, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/AppShell";
import { useSession } from "@/lib/auth";

const SKIP_KEY = "bb_welcome_skipped";

/** Routes that must never be covered by the welcome screen. */
const OPEN_PATHS = ["/auth", "/reset-password", "/api"];

/**
 * First-run screen: new visitors are asked to create an account or sign in,
 * and can still choose to continue without an account.
 */
export function WelcomeGate({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hydrated, setHydrated] = useState(false);
  const [skipped, setSkipped] = useState(true);

  useEffect(() => {
    setSkipped(window.localStorage.getItem(SKIP_KEY) === "1");
    setHydrated(true);
  }, []);

  const isOpenPath = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const show = hydrated && ready && !user && !skipped && !isOpenPath;

  if (!show) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md text-center">
        <BrandMark className="justify-center" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Welcome to BoardBuddy</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Your smart Class 10 board exam partner. Create a free account to save your progress, or sign
          in if you already have one.
        </p>

        <ul className="mx-auto mt-6 grid gap-3 text-left sm:grid-cols-3">
          {[
            { icon: BookOpen, label: "Chapter-wise learning and NCERT solutions" },
            { icon: LineChart, label: "Real progress tracking and analytics" },
            { icon: CloudUpload, label: "Your progress synced on every device" },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="surface flex items-start gap-2 p-3 text-xs font-semibold">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-7 grid gap-2">
          <Link
            to="/auth"
            search={{ redirect: pathname }}
            className="brand-gradient flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-primary-foreground"
          >
            Create a free account
          </Link>
          <Link
            to="/auth"
            search={{ redirect: pathname }}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-border text-sm font-bold"
          >
            I already have an account
          </Link>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(SKIP_KEY, "1");
              setSkipped(true);
            }}
            className="mt-1 h-11 w-full text-sm font-semibold text-primary"
          >
            Continue without an account
          </button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          No email needed — just a username and password.
        </p>
      </div>
    </div>
  );
}
