import { Link } from "@tanstack/react-router";
import { BadgeCheck, ChevronRight, Clock, Crown, RefreshCw, Sparkles } from "lucide-react";
import { useSubscriptionStatus } from "@/lib/subscription";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Live subscription status for the dashboard and the profile page.
 * Shows: everything-unlocked / active plan + validity / expired plan / no plan.
 */
export function SubscriptionCard({ className, showFeatures }: { className?: string; showFeatures?: boolean }) {
  const status = useSubscriptionStatus();

  if (status.state === "loading") {
    return (
      <div className={cn("surface flex items-center gap-4 p-5", className)}>
        <span className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <span className="block h-3.5 w-32 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-48 max-w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (status.state === "off") {
    return (
      <div className={cn("surface flex items-center gap-4 p-5", className)}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-success-soft text-success">
          <Crown className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">Everything unlocked</p>
          <p className="text-xs text-muted-foreground">
            All tests, analytics and solutions are open for you right now.
          </p>
        </div>
      </div>
    );
  }

  if (status.state === "active") {
    return (
      <div className={cn("surface overflow-hidden", className)}>
        <Link to="/subscribe" className="flex items-center gap-4 p-5 transition-transform active:scale-[0.99]">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
              status.isMax ? "bg-primary/15 text-primary" : "bg-success-soft text-success",
            )}
          >
            {status.isMax ? <BadgeCheck className="h-6 w-6" /> : <Crown className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-base font-extrabold">
              <span className="truncate">{status.planName}</span>
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                Active
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {status.expiresAt ? `Valid till ${formatDate(status.expiresAt)}` : "Active plan"}
              {status.daysLeft !== null ? ` · ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left` : ""}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        {showFeatures && status.planFeatures.length > 0 && (
          <ul className="border-t border-border px-5 py-3 space-y-1.5">
            {status.planFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {f}
              </li>
            ))}
            <li className="pt-1 text-[11px] font-semibold text-muted-foreground">
              These are the only features included in your plan.
            </li>
          </ul>
        )}
      </div>
    );
  }

  if (status.state === "expired") {
    return (
      <Link
        to="/subscribe"
        className={cn("surface flex items-center gap-4 p-5 transition-transform active:scale-[0.99]", className)}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-destructive/12 text-destructive">
          <Clock className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-base font-extrabold">
            <span className="truncate">{status.planName}</span>
            <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
              Expired
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {status.expiresAt ? `Ended on ${formatDate(status.expiresAt)} · ` : ""}renew to unlock premium again
          </p>
        </div>
        <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  return (
    <Link
      to="/subscribe"
      className={cn("surface flex items-center gap-4 p-5 transition-transform active:scale-[0.99]", className)}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-hero-amber/20 text-hero-amber">
        <Sparkles className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold">No active plan</p>
        <p className="text-xs text-muted-foreground">
          3D models, concept videos, ad-free study and the AI doubt tutor.
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
