/**
 * Support desk.
 *
 * Rules (fixed):
 *  - Free students  → no support desk at all, only self-help answers.
 *  - Paid students  → email support only.
 *  - Max Pro        → direct contact: call, WhatsApp aur Gmail.
 *
 * Contact details are owner-editable in /owner/support.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Headset, Lock, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSupportAccess, useSupportSettings } from "@/lib/support";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Max Pro Direct Help | BoardBuddy" },
      {
        name: "description",
        content:
          "Premium students get email support on Gmail. Max Pro students get direct phone and WhatsApp help from the BoardBuddy team.",
      },
      { property: "og:title", content: "Support — Max Pro Direct Help | BoardBuddy" },
      { property: "og:description", content: "Email support for premium, direct contact for Max Pro students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { ready, tier } = useSupportAccess();
  const { settings, ready: settingsReady } = useSupportSettings();

  return (
    <AppShell title="Support">
      <div className="surface mt-1 flex items-center gap-3 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Headset className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-extrabold">BoardBuddy support</p>
          <p className="text-xs text-muted-foreground">
            {tier === "direct"
              ? "Max Pro — direct contact with the team."
              : tier === "email"
                ? "Premium — we reply by email."
                : "The support desk comes with premium plans."}
          </p>
        </div>
      </div>

      {!ready || !settingsReady ? (
        <div className="surface mt-3 h-32 animate-pulse" aria-hidden />
      ) : tier === "none" ? (
        <section className="surface mt-3 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-extrabold">Support is for premium students</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            The support desk is not included in the free plan. Any premium plan gives you email support, and{" "}
            <b className="text-foreground">Max Pro</b> lets you reach the team directly by call or WhatsApp.
          </p>
          <Link
            to="/subscribe"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            See plans
          </Link>
        </section>
      ) : (
        <div className="mt-3 space-y-3">
          {settings.email ? (
            <a href={`mailto:${settings.email}`} className="surface flex items-center gap-3 p-4">
              <Mail className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">Email support (Gmail)</span>
                <span className="block truncate text-xs text-muted-foreground">{settings.email}</span>
              </span>
            </a>
          ) : null}

          {tier === "direct" && settings.phone ? (
            <a href={`tel:${settings.phone}`} className="surface flex items-center gap-3 p-4">
              <Phone className="h-5 w-5 shrink-0 text-success" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">Direct call — Max Pro</span>
                <span className="block truncate text-xs text-muted-foreground">{settings.phone}</span>
              </span>
            </a>
          ) : null}

          {tier === "direct" && settings.whatsapp ? (
            <a
              href={`https://wa.me/${settings.whatsapp.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="surface flex items-center gap-3 p-4"
            >
              <MessageCircle className="h-5 w-5 shrink-0 text-success" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">WhatsApp — Max Pro</span>
                <span className="block truncate text-xs text-muted-foreground">{settings.whatsapp}</span>
              </span>
            </a>
          ) : null}

          {tier === "email" ? (
            <div className="surface p-4 text-xs font-medium text-muted-foreground">
              <p className="text-sm font-bold text-foreground">Your plan includes email support</p>
              <p className="mt-1">
                Email us your order ID and the problem you are facing. Direct call and WhatsApp support is available
                only on the <b className="text-foreground">Max Pro</b> plan.
              </p>
              <Link to="/subscribe" className="mt-2 inline-block font-bold text-primary underline">
                Upgrade to Max Pro
              </Link>
            </div>
          ) : null}

          {!settings.email && !settings.phone && !settings.whatsapp ? (
            <div className="surface p-4 text-xs font-semibold text-muted-foreground">
              Support contact details are being updated. Please check again shortly.
            </div>
          ) : null}

          <div className="surface p-4 text-xs text-muted-foreground">
            <p className="font-bold text-foreground">Support hours</p>
            <p className="mt-1">{settings.hours}</p>
            {settings.note ? <p className="mt-2">{settings.note}</p> : null}
            <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              We never ask for your password or OTP.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
