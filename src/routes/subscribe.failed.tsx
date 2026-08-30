/**
 * Payment failed / cancelled screen.
 *
 * Razorpay checkout band ho jaaye, card decline ho ya verification fail ho —
 * student yahan aata hai. Yahan reason, order id aur seedha "Try again" CTA
 * milta hai, plus support ka link.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, HelpCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlanCatalogue } from "@/lib/subscription";
import { useSupportAccess } from "@/lib/support";

type FailedSearch = {
  order: string | undefined;
  plan: string | undefined;
  reason: string | undefined;
};

export const Route = createFileRoute("/subscribe/failed")({
  validateSearch: (search: Record<string, unknown>): FailedSearch => ({
    order: typeof search['order'] === "string" ? search['order'] : undefined,
    plan: typeof search['plan'] === "string" ? search['plan'] : undefined,
    reason: typeof search['reason'] === "string" ? search['reason'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment Failed — BoardBuddy Premium" },
      {
        name: "description",
        content:
          "Your BoardBuddy premium payment did not go through. See what happened and retry the payment safely with Razorpay.",
      },
      { property: "og:title", content: "Payment Failed — BoardBuddy Premium" },
      { property: "og:description", content: "Payment not completed. Retry your BoardBuddy premium purchase." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FailedPage,
});

function FailedPage() {
  const { order, plan: planId, reason } = Route.useSearch();
  const navigate = useNavigate();
  const { plans } = usePlanCatalogue();
  const { tier: supportTier } = useSupportAccess();
  const plan = planId ? (plans.find((p) => p.id === planId) ?? null) : null;
  const cancelled = (reason ?? "").toLowerCase().includes("cancel");

  return (
    <AppShell title={cancelled ? "Payment cancelled" : "Payment failed"}>
      <section className="surface mt-4 overflow-hidden">
        <div className="bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent p-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-destructive/12 text-destructive">
            {cancelled ? <AlertTriangle className="h-9 w-9" /> : <XCircle className="h-9 w-9" />}
          </span>
          <h1 className="mt-3 text-lg font-extrabold">
            {cancelled ? "Payment cancelled" : "Payment could not be completed"}
          </h1>
          <p className="mt-1 text-sm font-bold text-destructive">
            {reason ?? "The payment was not completed."}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs font-medium text-muted-foreground">
            Ghabraiye mat — aapke paise nahi kate hain. Agar bank se amount kata bhi hai to Razorpay use 5–7 working
            days mein automatically wapas kar deta hai. Neeche se dobara try kar sakte hain.
          </p>
        </div>

        <dl className="divide-y divide-border border-t border-border">
          {plan && <Row label="Plan" value={plan.name} />}
          {!plan && planId && <Row label="Plan" value={planId} />}
          {order && <Row label="Order ID" value={order} mono />}
          <Row label="Status" value={cancelled ? "Cancelled by you" : "Failed"} />
        </dl>
      </section>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: "/subscribe" })}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        {supportTier === "none" ? null : (
          <Link
            to="/support"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold"
          >
            <HelpCircle className="h-4 w-4" />
            {supportTier === "direct" ? "Contact support directly" : "Email support"}
          </Link>
        )}
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-xl text-sm font-bold text-muted-foreground"
        >
          Continue studying for free
        </Link>
      </div>

      <section className="surface mt-4 p-4">
        <h2 className="text-sm font-extrabold">Common reasons</h2>
        <ul className="mt-2 space-y-1.5 text-xs font-medium text-muted-foreground">
          <li>• UPI app ya bank ka OTP time out ho gaya.</li>
          <li>• Card par online / international payment band hai.</li>
          <li>• Account mein amount se kam balance tha.</li>
          <li>• Internet beech mein cut gaya ya checkout window band ho gayi.</li>
        </ul>
        {supportTier === "none" ? (
          <p className="mt-3 text-[11px] font-semibold text-muted-foreground">
            Note: payment ke liye alag se support desk nahi hai — dobara try karein. Support desk premium plans ke saath
            aata hai (Max Pro par direct contact).
          </p>
        ) : null}
        <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-success">
          <ShieldCheck className="h-3.5 w-3.5" />
          Payments are processed securely by Razorpay — we never see your card details.
        </p>
      </section>
    </AppShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={["min-w-0 truncate text-right text-xs font-semibold", mono ? "font-mono" : ""].join(" ")}>
        {value}
      </dd>
    </div>
  );
}
