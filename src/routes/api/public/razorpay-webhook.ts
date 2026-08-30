/**
 * Razorpay webhook — the authoritative source of truth for subscription status.
 *
 * Configure in the Razorpay dashboard:
 *   URL:    https://<your-app>/api/public/razorpay-webhook
 *   Events: payment.captured, order.paid, payment.failed, refund.processed
 *   Secret: same value saved in the owner panel as `razorpay_webhook_secret`
 *
 * Every request is HMAC-SHA256 verified before anything is written.
 * Database access goes through the shared server-access layer, so this works
 * both on managed hosting (service-role key) and on a self-hosted Worker
 * (server access token).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; status?: string } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { payment_id?: string } };
    subscription?: { entity?: { id?: string } };
  };
};

function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("x-razorpay-signature") ?? "";

        const { readSecureSettings, activatePaidOrder, markOrderStatus } = await import("@/lib/serverAccess.server");

        // Host secret first (works on Lovable and Cloudflare), then owner-panel value.
        let secret = (process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "").trim();
        if (!secret) {
          try {
            secret = (await readSecureSettings(["razorpay_webhook_secret"])).get("razorpay_webhook_secret") ?? "";
          } catch {
            return new Response("Server keys not linked", { status: 503 });
          }
        }
        if (!secret) return new Response("Webhook not configured", { status: 503 });


        const expected = createHmac("sha256", secret).update(body).digest("hex");
        if (!signature || !safeEqualHex(signature, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: RazorpayEvent;
        try {
          event = JSON.parse(body) as RazorpayEvent;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const name = event.event ?? "";
        const payment = event.payload?.payment?.entity;
        const orderId = payment?.order_id ?? event.payload?.order?.entity?.id ?? null;

        if (name === "payment.captured" || name === "order.paid") {
          if (!orderId) return new Response("ok");
          await activatePaidOrder({ orderId, paymentId: payment?.id ?? null });
          return new Response("ok");
        }

        if (name === "payment.failed" && orderId) {
          await markOrderStatus({ status: "failed", orderId });
          return new Response("ok");
        }

        if (name === "subscription.cancelled" || name === "subscription.halted") {
          // This app charges one-time orders per plan, so a cancellation is matched
          // through the order that created the subscription row.
          if (orderId) await markOrderStatus({ status: "cancelled", orderId, expireNow: true });
          return new Response("ok");
        }

        // payment.refunded, refund.created, refund.processed — revoke access immediately.
        const refundedPaymentId =
          event.payload?.refund?.entity?.payment_id ?? (name === "payment.refunded" ? (payment?.id ?? null) : null);
        if ((name === "payment.refunded" || name.startsWith("refund.")) && (refundedPaymentId || orderId)) {
          await markOrderStatus({
            status: "refunded",
            expireNow: true,
            ...(refundedPaymentId ? { paymentId: refundedPaymentId } : { orderId }),
          });
          return new Response("ok");
        }

        return new Response("ok");
      },
    },
  },
});
