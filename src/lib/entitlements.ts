/**
 * Single source of truth for "who can use what".
 *
 * Rules (fixed, owner cannot break them by editing plan text):
 *  - Subscriptions OFF (master switch) → everything is open, no ads.
 *  - Subscriptions ON:
 *      • Free students get the study basics. Some of them are shown after a
 *        short ad (see FREE_AD_SECONDS).
 *      • `pro` features need any active paid plan.
 *      • `max` features (AI tutor, priority support) need the Max Pro plan.
 *  - Access always ends exactly when the plan expires — `my_entitlement`
 *    returns nothing once `expires_at` has passed or the payment was
 *    refunded/cancelled, so the app falls back to the free rules instantly.
 */
import { usePremium } from "@/lib/subscription";

export type FeatureTier = "pro" | "max";

export type PremiumFeature = {
  key: string;
  label: string;
  tier: FeatureTier;
  /** Shown inside the lock card so the student knows what they are missing. */
  description: string;
};

export const PREMIUM_FEATURES: Record<string, PremiumFeature> = {
  models: {
    key: "models",
    label: "3D science models",
    tier: "pro",
    description: "Interactive 3D models and concept visuals for Science chapters.",
  },
  tutor: {
    key: "tutor",
    label: "AI doubt tutor",
    tier: "max",
    description: "Step-by-step NCERT-based answers to any doubt, any time.",
  },
  support: {
    key: "support",
    label: "Priority support",
    tier: "max",
    description: "Direct phone and email help from the BoardBuddy team.",
  },
  adfree: {
    key: "adfree",
    label: "Ad-free study",
    tier: "pro",
    description: "No banner or interstitial ads anywhere in the app.",
  },
};

/**
 * Free features that are shown after a short ad.
 * Value = seconds the student has to wait before continuing.
 */
export const FREE_AD_SECONDS: Record<string, number> = {
  tests: 5,
  practice: 3,
  bookmarks: 5,
};

/**
 * Free forever, never behind an ad:
 * NCERT solutions, chapter quiz, daily mixed challenge, my analysis,
 * progress, leaderboard, study calendar, achievements and notifications.
 */
export const FREE_NO_AD = [
  "ncert",
  "quiz",
  "challenge",
  "analysis",
  "progress",
  "leaderboard",
  "calendar",
  "achievements",
] as const;

export type FeatureAccess = {
  ready: boolean;
  allowed: boolean;
  subscriptionsEnabled: boolean;
  feature: PremiumFeature | undefined;
  /** Plan name to show in the English "please subscribe" message. */
  requiredPlan: string;
};

/**
 * Words that appear on the plan cards for each premium feature.
 * A student gets EXACTLY what their purchased plan advertises — nothing more,
 * nothing less. If a plan line does not mention the feature, it stays locked.
 */
const FEATURE_MATCHERS: Record<string, RegExp[]> = {
  models: [/3d/i, /model/i, /concept video/i],
  tutor: [/ai\s*(doubt)?\s*tutor/i, /doubt[- ]solv/i],
  support: [/priority support/i],
  adfree: [/ad[- ]?free/i, /no ads/i],
};

/** Does this plan's written feature list include the given feature? */
export function planIncludesFeature(features: string[], key: string, tier?: string | null): boolean {
  const matchers = FEATURE_MATCHERS[key];
  if (!matchers) return true; // unknown key → don't block by mistake
  if (features.some((f) => matchers.some((re) => re.test(f)))) return true;
  // "Everything in Yearly" style lines inherit every pro-tier feature.
  const inherits = features.some((f) => /everything in/i.test(f));
  if (inherits && PREMIUM_FEATURES[key]?.tier === "pro") return true;
  // Empty/unfilled feature list → fall back to the plan tier so nothing breaks.
  if (features.length === 0) return PREMIUM_FEATURES[key]?.tier === "max" ? tier === "max" : true;
  return false;
}

/** Can the signed-in student actually USE this premium feature right now? */
export function useFeatureAccess(key: keyof typeof PREMIUM_FEATURES | string): FeatureAccess {
  const { subscriptionsEnabled, entitlement, planFeatures, ready } = usePremium();
  const feature = PREMIUM_FEATURES[key];
  const tier = feature?.tier ?? "pro";
  const allowed =
    !subscriptionsEnabled ||
    (!!entitlement && planIncludesFeature(planFeatures, key, entitlement.tier));

  return {
    ready,
    allowed,
    subscriptionsEnabled,
    feature,
    requiredPlan: tier === "max" ? "Max Pro" : "any premium",
  };
}

