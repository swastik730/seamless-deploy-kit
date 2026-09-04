/**
 * Subscription state for the app.
 *
 * A master switch lives in `app_settings` under `subscriptions_enabled`.
 * When it is OFF the whole app behaves as before (everything unlocked and no
 * pricing wording anywhere). When it is ON, premium content is gated behind an
 * active subscription and the Subscribe CTAs appear.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";

export const SUBSCRIPTIONS_ENABLED_KEY = "subscriptions_enabled";

export type Plan = {
  id: string;
  name: string;
  tagline: string | null;
  price_paise: number;
  duration_days: number;
  tier: string;
  features: string[];
  active: boolean;
  sort: number;
};

export type Entitlement = {
  plan_id: string;
  tier: string;
  expires_at: string;
};

export function formatPrice(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/* ------------------------------------------------------------------ *
 * Master switch (shared cache so every screen agrees)
 * ------------------------------------------------------------------ */

let cachedEnabled: boolean | undefined;
const listeners = new Set<(v: boolean) => void>();

async function fetchEnabled() {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SUBSCRIPTIONS_ENABLED_KEY)
    .maybeSingle();
  cachedEnabled = (data?.value as string | undefined) === "on";
  listeners.forEach((l) => l(cachedEnabled as boolean));
}

export function useSubscriptionsEnabled() {
  const [enabled, setEnabled] = useState<boolean>(cachedEnabled ?? false);
  const [ready, setReady] = useState(cachedEnabled !== undefined);

  useEffect(() => {
    const listener = (v: boolean) => {
      setEnabled(v);
      setReady(true);
    };
    listeners.add(listener);
    if (cachedEnabled === undefined) void fetchEnabled();
    else listener(cachedEnabled);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { enabled, ready };
}

export async function saveSubscriptionsEnabled(next: boolean) {
  const { data: sessionData } = await supabase.auth.getSession();
  const { error } = await supabase.from("app_settings").upsert({
    key: SUBSCRIPTIONS_ENABLED_KEY,
    value: next ? "on" : "off",
    updated_by: sessionData.session?.user.id ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  cachedEnabled = next;
  listeners.forEach((l) => l(next));
}

/* ------------------------------------------------------------------ *
 * Plans + entitlement
 * ------------------------------------------------------------------ */

export function usePlans(includeInactive = false) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void supabase
      .from("plans")
      .select("*")
      .order("sort", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []).map((p) => ({
          ...p,
          features: Array.isArray(p.features) ? (p.features as string[]) : [],
        })) as Plan[];
        setPlans(includeInactive ? rows : rows.filter((p) => p.active));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [includeInactive, nonce]);

  return { plans, loading, refresh };
}

export function useEntitlement() {
  const { user, ready } = useSession();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    if (!ready) return;
    if (!user) {
      setEntitlement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase.rpc("my_entitlement").then(({ data, error }) => {
      if (!active) return;
      // A failed read (offline / transient network error) must never look like
      // "no subscription" — keep the last known good state instead.
      if (error) {
        setLoading(false);
        return;
      }
      const row = (data as Entitlement[] | null)?.[0] ?? null;
      setEntitlement(row);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, ready, nonce]);

  return { entitlement, loading: loading || !ready, refresh };
}

/* ------------------------------------------------------------------ *
 * Cached plan catalogue (so gating + status cards do not refetch)
 * ------------------------------------------------------------------ */

let plansCache: Plan[] | undefined;
let plansPromise: Promise<Plan[]> | undefined;
const planListeners = new Set<(v: Plan[]) => void>();

async function fetchPlans(): Promise<Plan[]> {
  const { data } = await supabase.from("plans").select("*").order("sort", { ascending: true });
  const rows = (data ?? []).map((p) => ({
    ...p,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
  })) as Plan[];
  plansCache = rows;
  planListeners.forEach((l) => l(rows));
  return rows;
}

function loadPlans(): Promise<Plan[]> {
  plansPromise ??= fetchPlans();
  return plansPromise;
}

/** All plans (cached across the app). */
export function usePlanCatalogue() {
  const [plans, setPlans] = useState<Plan[]>(plansCache ?? []);
  const [ready, setReady] = useState(plansCache !== undefined);

  useEffect(() => {
    const listener = (v: Plan[]) => {
      setPlans(v);
      setReady(true);
    };
    planListeners.add(listener);
    if (plansCache) listener(plansCache);
    else void loadPlans();
    return () => {
      planListeners.delete(listener);
    };
  }, []);

  return { plans, ready };
}

/**
 * The single question every screen asks: may this person use premium content?
 * Subscriptions OFF → everyone is premium.
 */
export function usePremium() {
  const { enabled, ready: switchReady } = useSubscriptionsEnabled();
  const { entitlement, loading, refresh } = useEntitlement();
  const { plans, ready: plansReady } = usePlanCatalogue();

  const active = !!entitlement;
  const plan = entitlement ? (plans.find((p) => p.id === entitlement.plan_id) ?? null) : null;
  return {
    subscriptionsEnabled: enabled,
    entitlement,
    /** The plan the student actually bought (null when not subscribed). */
    plan,
    /** Exactly the feature lines written on the purchased plan. */
    planFeatures: plan?.features ?? [],
    isPremium: !enabled || active,
    isMax: !!entitlement && entitlement.tier === "max",
    ready: switchReady && !loading && (!active || plansReady),
    refresh,
  };
}

export type SubscriptionState = "loading" | "off" | "none" | "active" | "expired";

export type SubscriptionStatus = {
  state: SubscriptionState;
  planName: string | null;
  planFeatures: string[];
  tier: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  isMax: boolean;
};

/**
 * Full status for the dashboard / profile card: active, expired or never
 * subscribed — with the plan name and the exact feature list of that plan.
 */
export function useSubscriptionStatus(): SubscriptionStatus {
  const { subscriptionsEnabled, entitlement, plan, ready, isMax } = usePremium();
  const { plans } = usePlanCatalogue();
  const { user } = useSession();
  const [last, setLast] = useState<{ plan_id: string; expires_at: string | null } | null>(null);
  const [lastReady, setLastReady] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLast(null);
      setLastReady(true);
      return;
    }
    setLastReady(false);
    void supabase
      .from("subscriptions")
      .select("plan_id,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!active) return;
        const row = (data ?? [])[0] as { plan_id: string; expires_at: string | null } | undefined;
        setLast(row ?? null);
        setLastReady(true);
      });
    return () => {
      active = false;
    };
  }, [user, entitlement]);

  if (!ready || !lastReady) {
    return { state: "loading", planName: null, planFeatures: [], tier: null, expiresAt: null, daysLeft: null, isMax: false };
  }
  if (!subscriptionsEnabled) {
    return { state: "off", planName: null, planFeatures: [], tier: null, expiresAt: null, daysLeft: null, isMax: false };
  }
  if (entitlement) {
    const ms = new Date(entitlement.expires_at).getTime() - Date.now();
    return {
      state: "active",
      planName: plan?.name ?? entitlement.plan_id,
      planFeatures: plan?.features ?? [],
      tier: entitlement.tier,
      expiresAt: entitlement.expires_at,
      daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)),
      isMax,
    };
  }
  if (last) {
    const expiredPlan = plans.find((p) => p.id === last.plan_id) ?? null;
    return {
      state: "expired",
      planName: expiredPlan?.name ?? last.plan_id,
      planFeatures: expiredPlan?.features ?? [],
      tier: expiredPlan?.tier ?? null,
      expiresAt: last.expires_at,
      daysLeft: 0,
      isMax: false,
    };
  }
  return { state: "none", planName: null, planFeatures: [], tier: null, expiresAt: null, daysLeft: null, isMax: false };
}


/** Blue-tick user ids (Max Pro subscribers) for public lists. */
export function useVerifiedUsers() {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    void supabase.rpc("verified_users").then(({ data }) => {
      if (!active) return;
      const rows = (data as { user_id: string }[] | null) ?? [];
      setIds(new Set(rows.map((r) => r.user_id)));
    });
    return () => {
      active = false;
    };
  }, []);

  return ids;
}
