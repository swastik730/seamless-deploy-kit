/**
 * Server-side data access that works on BOTH hosting modes:
 *
 *  1. Managed Lovable hosting — SUPABASE_SERVICE_ROLE_KEY exists, so we use the admin client.
 *  2. Self-hosted (Cloudflare Worker) — no service-role key. The owner generates a
 *     "server access token" in Owner Panel → Keys and stores it as the Worker secret
 *     SERVER_ACCESS_TOKEN. The server then talks to the database through token-guarded
 *     security-definer functions (server_secure_settings, server_activate_subscription, …).
 *
 * Never import this file from a component; it is server-only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ServerMode = "service_role" | "token" | "none";

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : "";
}

function supabaseUrl() {
  return (
    env("SUPABASE_URL") ||
    env("VITE_SUPABASE_URL") ||
    ((import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "")
  );
}

function publishableKey() {
  return (
    env("SUPABASE_PUBLISHABLE_KEY") ||
    env("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    ((import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? "")
  );
}

export function serverAccessToken() {
  return env("SERVER_ACCESS_TOKEN");
}

export function serverMode(): ServerMode {
  if (supabaseUrl() && (env("SUPABASE_SERVICE_ROLE_KEY") || env("APP_SUPABASE_SERVICE_ROLE_KEY")))
    return "service_role";
  if (supabaseUrl() && publishableKey() && serverAccessToken()) return "token";
  return "none";
}

let _public: SupabaseClient<Database> | undefined;

/** Publishable-key client (no user session). New-format keys are opaque, so send them as `apikey` only. */
export function publicServerClient() {
  if (_public) return _public;
  const url = supabaseUrl();
  const key = publishableKey();
  if (!url || !key) throw new Error("Backend connection is not configured on the server.");
  _public = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input as RequestInfo, { ...init, headers });
      },
    },
  });
  return _public;
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const SERVER_SETUP_MESSAGE =
  "Server keys are not linked on this host yet. Owner Panel → Keys → generate the server access token and add it to the host as SERVER_ACCESS_TOKEN.";

/** Read private settings (Razorpay/AI keys) using whichever access mode is available. */
export async function readSecureSettings(keys: string[]): Promise<Map<string, string>> {
  const mode = serverMode();
  if (mode === "service_role") {
    const admin = await adminClient();
    const { data } = await admin.from("secure_settings").select("key,value").in("key", keys);
    return new Map((data ?? []).map((r) => [r.key, r.value]));
  }
  if (mode === "token") {
    const { data, error } = await publicServerClient().rpc("server_secure_settings", {
      _token: serverAccessToken(),
      _keys: keys,
    });
    if (error) throw new Error(SERVER_SETUP_MESSAGE);
    return new Map(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  }
  throw new Error(SERVER_SETUP_MESSAGE);
}

export async function getPlanRow(planId: string) {
  const mode = serverMode();
  const client = mode === "service_role" ? await adminClient() : publicServerClient();
  const { data } = await client.from("plans").select("*").eq("id", planId).maybeSingle();
  return data;
}

export async function recordPendingOrder(input: {
  userId: string;
  planId: string;
  amountPaise: number;
  orderId: string;
}) {
  const mode = serverMode();
  if (mode === "service_role") {
    const admin = await adminClient();
    const { error } = await admin.from("subscriptions").insert({
      user_id: input.userId,
      plan_id: input.planId,
      amount_paise: input.amountPaise,
      razorpay_order_id: input.orderId,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (mode === "token") {
    const { error } = await publicServerClient().rpc("server_record_pending_subscription", {
      _token: serverAccessToken(),
      _user_id: input.userId,
      _plan_id: input.planId,
      _amount_paise: input.amountPaise,
      _order_id: input.orderId,
    });
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error(SERVER_SETUP_MESSAGE);
}

/** Activate a paid order. Idempotent. Returns the expiry ISO date, or null when the order is unknown. */
export async function activatePaidOrder(input: {
  orderId: string;
  paymentId: string | null;
  userId?: string | null;
}): Promise<string | null> {
  const mode = serverMode();
  if (mode === "token" || mode === "service_role") {
    const client = mode === "service_role" ? await adminClient() : publicServerClient();
    if (mode === "service_role") {
      // Same logic, but the admin client can also fall back to the RPC-free path.
      const admin = client as Awaited<ReturnType<typeof adminClient>>;
      let q = admin.from("subscriptions").select("id,plan_id,status,expires_at").eq("razorpay_order_id", input.orderId);
      if (input.userId) q = q.eq("user_id", input.userId);
      const { data: sub } = await q.maybeSingle();
      if (!sub) return null;
      if (sub.status === "active") return sub.expires_at;
      const { data: plan } = await admin.from("plans").select("duration_days").eq("id", sub.plan_id).maybeSingle();
      const now = new Date();
      const expires = new Date(now.getTime() + (plan?.duration_days ?? 30) * 86400000);
      const { error } = await admin
        .from("subscriptions")
        .update({
          status: "active",
          razorpay_payment_id: input.paymentId,
          starts_at: now.toISOString(),
          expires_at: expires.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", sub.id);
      if (error) throw new Error(error.message);
      return expires.toISOString();
    }
    const { data, error } = await publicServerClient().rpc("server_activate_subscription", {
      _token: serverAccessToken(),
      _order_id: input.orderId,
      _payment_id: input.paymentId ?? "",
      ...(input.userId ? { _user_id: input.userId } : {}),
    });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  }
  throw new Error(SERVER_SETUP_MESSAGE);
}

export async function markOrderStatus(input: {
  status: "failed" | "cancelled" | "refunded";
  orderId?: string | null;
  paymentId?: string | null;
  expireNow?: boolean;
}) {
  const mode = serverMode();
  if (mode === "service_role") {
    const admin = await adminClient();
    const now = new Date().toISOString();
    const patch = {
      status: input.status,
      updated_at: now,
      ...(input.expireNow ? { expires_at: now } : {}),
    };
    const query = admin.from("subscriptions").update(patch);
    await (input.paymentId
      ? query.eq("razorpay_payment_id", input.paymentId)
      : query.eq("razorpay_order_id", input.orderId ?? ""));
    return;
  }
  if (mode === "token") {
    await publicServerClient().rpc("server_mark_subscription", {
      _token: serverAccessToken(),
      _status: input.status,
      ...(input.orderId ? { _order_id: input.orderId } : {}),
      ...(input.paymentId ? { _payment_id: input.paymentId } : {}),
      _expire_now: input.expireNow ?? false,
    });
    return;
  }
  throw new Error(SERVER_SETUP_MESSAGE);
}

/** Owner-panel diagnostics: can this host actually read the saved keys? */
export async function serverAccessDiagnostics() {
  const mode = serverMode();
  const envRazorpay = !!env("RAZORPAY_KEY_ID") && !!env("RAZORPAY_KEY_SECRET");
  const envWebhook = !!env("RAZORPAY_WEBHOOK_SECRET");
  const out = {
    mode,
    hasServiceRole: mode === "service_role",
    hasToken: !!serverAccessToken(),
    canReadKeys: false,
    hasRazorpay: envRazorpay,
    hasWebhookSecret: envWebhook,
    hasBuiltInAi: !!env("LOVABLE_API_KEY"),
    hasOwnerAiKey: false,
    message: "",
  };
  if (mode === "none") {
    out.canReadKeys = envRazorpay;
    out.message = envRazorpay
      ? "Razorpay keys are set as host secrets, so checkout works. Database-stored keys are not readable on this host."
      : SERVER_SETUP_MESSAGE;
    return out;
  }
  try {
    const map = await readSecureSettings([
      "razorpay_key_id",
      "razorpay_key_secret",
      "razorpay_webhook_secret",
      "ai_api_key",
    ]);
    out.canReadKeys = true;
    out.hasRazorpay = envRazorpay || (!!map.get("razorpay_key_id")?.trim() && !!map.get("razorpay_key_secret")?.trim());
    out.hasWebhookSecret = envWebhook || !!map.get("razorpay_webhook_secret")?.trim();
    out.hasOwnerAiKey = !!map.get("ai_api_key")?.trim();
    out.message = out.hasRazorpay ? "Server can read the saved keys." : "Server is linked, but Razorpay keys are empty.";
  } catch (e) {
    out.canReadKeys = envRazorpay;
    out.message = envRazorpay
      ? "Razorpay keys are set as host secrets, so checkout works."
      : e instanceof Error
        ? e.message
        : SERVER_SETUP_MESSAGE;
  }
  return out;
}
