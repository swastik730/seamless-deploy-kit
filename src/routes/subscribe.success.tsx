/**
 * Payment success screen.
 *
 * Razorpay ke checkout ke baad student yahan aata hai. Yahan par thank-you
 * message, plan ki poori detail, payment/order id aur validity dikhti hai —
 * sab kuch live Supabase (`subscriptions` + `plans` + `my_entitlement`) se.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Crown, Download, PartyPopper, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatPrice, usePremium } from "@/lib/subscription";
import { PREMIUM_FEATURES, planIncludesFeature } from "@/lib/entitlements";

type SuccessSearch = {
  order: string | undefined;
  payment: string | undefined;
  plan: string | undefined;
};

type OrderRow = {
  id: string;
  plan_id: string;
  status: string;
  amount_paise: number;
  created_at: string;
  expires_at: string | null;
  razorpay_payment_id: string | null;
};


export const Route = createFileRoute("/subscribe/success")({
  validateSearch: (search: Record<string, unknown>): SuccessSearch => ({
    order: typeof search['order'] === "string" ? search['order'] : undefined,
    payment: typeof search['payment'] === "string" ? search['payment'] : undefined,
    plan: typeof search['plan'] === "string" ? search['plan'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment Successful — BoardBuddy Premium" },
      {
        name: "description",
        content: "Your BoardBuddy premium plan is active. See your payment details, plan validity and start studying.",
      },
      { property: "og:title", content: "Payment Successful — BoardBuddy Premium" },
      { property: "og:description", content: "Premium unlocked on BoardBuddy — 3D models, mock tests and AI tutor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { order, payment, plan: planId } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const { entitlement, refresh } = usePremium();
  const [row, setRow] = useState<OrderRow | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const query = supabase
      .from("subscriptions")
      .select("id,plan_id,status,amount_paise,created_at,expires_at,razorpay_payment_id")
      .order("created_at", { ascending: false })
      .limit(1);
    void (order ? query.eq("razorpay_order_id", order) : query).then(({ data }) => {
      if (active) setRow(((data ?? [])[0] as OrderRow | undefined) ?? null);
    });

    return () => {
      active = false;
    };
  }, [user, order]);

  const activePlanId = row?.plan_id ?? planId ?? entitlement?.plan_id ?? null;

  useEffect(() => {
    if (!activePlanId) return;
    let active = true;
    void supabase
      .from("plans")
      .select("name,features")
      .eq("id", activePlanId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setPlanName(data.name as string);
        setFeatures(Array.isArray(data.features) ? (data.features as string[]) : []);
      });
    return () => {
      active = false;
    };
  }, [activePlanId]);

  /** Premium features this plan does NOT advertise — shown as an honest diff. */
  const notIncluded = Object.values(PREMIUM_FEATURES).filter(
    (f) => !planIncludesFeature(features, f.key, entitlement?.tier ?? null),
  );

  const paymentId = payment ?? row?.razorpay_payment_id ?? null;
  const expiresAt = row?.expires_at ?? entitlement?.expires_at ?? null;

  async function copyReceipt() {
    const lines = [
      "BoardBuddy — payment receipt",
      `Plan: ${planName ?? activePlanId ?? "-"}`,
      row ? `Amount: ${formatPrice(row.amount_paise)}` : "",
      order ? `Order ID: ${order}` : "",
      paymentId ? `Payment ID: ${paymentId}` : "",
      row ? `Paid on: ${new Date(row.created_at).toLocaleString("en-IN")}` : "",
      expiresAt ? `Valid till: ${new Date(expiresAt).toLocaleDateString("en-IN")}` : "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <AppShell title="Payment successful">
      <section className="surface mt-4 overflow-hidden">
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-success/15 text-success">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h1 className="mt-3 flex items-center justify-center gap-2 text-lg font-extrabold">
            <PartyPopper className="h-5 w-5 text-primary" />
            Congratulations!
          </h1>
          <p className="mt-1 text-sm font-bold text-success">Payment successful — premium unlocked 🎉</p>
          <p className="mx-auto mt-2 max-w-sm text-xs font-medium text-muted-foreground">
            Thank you for joining BoardBuddy Premium{planName ? ` (${planName})` : ""}. Aapka plan turant active ho gaya
            hai — neeche dekhein aapke plan mein exactly kya-kya khula hai.
          </p>
        </div>

        <dl className="divide-y divide-border border-t border-border">
          <Detail label="Plan" value={planName ?? activePlanId ?? "—"} strong />
          {row && <Detail label="Amount paid" value={formatPrice(row.amount_paise)} strong />}
          {row && <Detail label="Status" value={row.status} />}
          {order && <Detail label="Order ID" value={order} mono />}
          {paymentId && <Detail label="Payment ID" value={paymentId} mono />}
          {row && <Detail label="Paid on" value={new Date(row.created_at).toLocaleString("en-IN")} />}
          {expiresAt && <Detail label="Valid till" value={new Date(expiresAt).toLocaleDateString("en-IN")} strong />}
          {user?.email && <Detail label="Account" value={user.email} />}
        </dl>
      </section>

      {entitlement && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-success/12 p-3 text-xs font-bold text-success">
          <ShieldCheck className="h-4 w-4" />
          Premium active till {new Date(entitlement.expires_at).toLocaleDateString("en-IN")}
        </p>
      )}

      {features.length > 0 && (
        <section className="surface mt-4 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
            <Crown className="h-4 w-4 text-primary" />
            Included in your plan
          </h2>
          <ul className="mt-2 space-y-1.5">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs font-medium text-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-muted/60 p-2 text-[11px] font-bold text-muted-foreground">
            Aapko bilkul yahi milega — is list se na kuch extra, na kuch kam.
          </p>
        </section>
      )}

      {notIncluded.length > 0 && (
        <section className="surface mt-3 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
            <XCircle className="h-4 w-4 text-muted-foreground" />
            Not included
          </h2>
          <ul className="mt-2 space-y-1.5">
            {notIncluded.map((f) => (
              <li key={f.key} className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span>
                  <b className="font-bold text-foreground/80">{f.label}</b> — {f.description}
                  {f.tier === "max" ? " (Max Pro)" : ""}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/subscribe" className="mt-3 inline-block text-[11px] font-bold text-primary underline">
            Upgrade karke ye bhi unlock karein
          </Link>
        </section>
      )}


      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
        >
          Start studying
        </button>
        <button
          type="button"
          onClick={() => void copyReceipt()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold"
        >
          {copied ? <Download className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Receipt copied" : "Copy receipt"}
        </button>
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Koi dikkat ho to{" "}
        <Link to="/support" className="text-primary underline">
          support
        </Link>{" "}
        par message karein · {" "}
        <Link to="/subscribe" className="text-primary underline">
          all plans
        </Link>
      </p>
    </AppShell>
  );
}

function Detail({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={[
          "min-w-0 truncate text-right text-xs",
          mono ? "font-mono" : "",
          strong ? "font-extrabold" : "font-semibold",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
