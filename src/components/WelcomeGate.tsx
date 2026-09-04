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
  // If the auth check is slow (or unavailable offline), stop waiting after a moment
  // so a first-time visitor is never left staring at the app without a choice.
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    setSkipped(window.localStorage.getItem(SKIP_KEY) === "1");
    setHydrated(true);
    const timer = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const isOpenPath = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const show = hydrated && (ready || waited) && !user && !skipped && !isOpenPath;


  if (!show) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-5 py-10 lg:px-10">
      <div className="grid w-full max-w-md items-center gap-10 lg:max-w-6xl lg:grid-cols-2 lg:gap-16 2xl:max-w-7xl">
        {/* Story panel */}
        <div className="text-center lg:text-left">
          <BrandMark className="justify-center lg:justify-start" />
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight lg:text-5xl xl:text-6xl">
            Welcome to BoardBuddy
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground lg:mx-0 lg:max-w-xl lg:text-lg">
            Your smart Class 10 board exam partner. Create a free account to save your progress
            everywhere, or sign in if you already have one.
          </p>

          <ul className="mx-auto mt-7 grid gap-3 text-left sm:grid-cols-3 lg:mx-0 lg:grid-cols-1 lg:max-w-lg">
            {[
              { icon: BookOpen, label: "Chapter-wise learning and NCERT solutions" },
              { icon: LineChart, label: "Real progress tracking and analytics" },
              { icon: CloudUpload, label: "Your progress synced on every device" },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="surface flex items-start gap-2 p-3 text-xs font-semibold lg:items-center lg:gap-3 lg:p-4 lg:text-base"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary lg:mt-0 lg:h-5 lg:w-5" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Action panel */}
        <div className="surface w-full p-5 text-center lg:p-8">
          <h2 className="text-base font-bold lg:text-xl">Get started in seconds</h2>
          <p className="mt-1 text-xs text-muted-foreground lg:text-sm">
            No email or OTP required — pick a username and start studying.
          </p>

          <div className="mt-6 grid gap-2 lg:gap-3">
            <Link
              to="/auth"
              search={{ redirect: pathname }}
              className="brand-gradient flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-14 lg:text-base"
            >
              Create a free account
            </Link>
            <Link
              to="/auth"
              search={{ redirect: pathname }}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-border text-sm font-bold transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-14 lg:text-base"
            >
              I already have an account
            </Link>
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(SKIP_KEY, "1");
                setSkipped(true);
              }}
              className="mt-1 h-11 w-full rounded-xl text-sm font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:h-12 lg:text-base"
            >
              Continue without an account
            </button>
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground lg:text-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            No email needed — just a username and password.
          </p>
        </div>
      </div>
    </div>
  );
}
