/** Razorpay helpers — server only. Keys live in the private `secure_settings` table. */
import { createHmac, timingSafeEqual } from "crypto";
import {
  activatePaidOrder,
  getPlanRow,
  readSecureSettings,
  recordPendingOrder,
  serverMode,
} from "./serverAccess.server";

export type RazorpayKeys = { keyId: string; keySecret: string };

function envValue(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : "";
}

/**
 * Keys come from host secrets first (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET —
 * works on Lovable and on Cloudflare), and fall back to the owner-panel values
 * stored in `secure_settings`.
 */
export async function getRazorpayKeys(): Promise<RazorpayKeys | null> {
  const envId = envValue("RAZORPAY_KEY_ID");
  const envSecret = envValue("RAZORPAY_KEY_SECRET");
  if (envId && envSecret) return { keyId: envId, keySecret: envSecret };
  try {
    const map = await readSecureSettings(["razorpay_key_id", "razorpay_key_secret"]);
    const keyId = (map.get("razorpay_key_id") ?? "").trim();
    const keySecret = (map.get("razorpay_key_secret") ?? "").trim();
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret };
  } catch {
    return null;
  }
}


/** Why keys could not be read — used to show the right message to the owner. */
export async function razorpayKeyStatus() {
  const mode = serverMode();
  if (mode === "none") return { keys: null, reason: "server_not_linked" as const };
  const keys = await getRazorpayKeys();
  return { keys, reason: keys ? ("ok" as const) : ("keys_missing" as const) };
}

export async function getSecureSetting(key: string): Promise<string | null> {
  const map = await readSecureSettings([key]);
  return map.get(key) ?? null;
}

export async function getPlan(planId: string) {
  return getPlanRow(planId);
}

export async function createRazorpayOrder(keys: RazorpayKeys, amountPaise: number, receipt: string) {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, payment_capture: 1 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order failed: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as { id: string; amount: number; currency: string };
}

export function verifyRazorpaySignature(keys: RazorpayKeys, orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", keys.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function recordPendingSubscription(input: {
  userId: string;
  planId: string;
  amountPaise: number;
  orderId: string;
}) {
  await recordPendingOrder(input);
}

export async function activateSubscription(input: {
  userId: string;
  orderId: string;
  paymentId: string;
  durationDays: number;
}) {
  const expiresAt = await activatePaidOrder({
    orderId: input.orderId,
    paymentId: input.paymentId,
    userId: input.userId,
  });
  if (!expiresAt) throw new Error("Order not found for this account");
  return { expiresAt };
}
