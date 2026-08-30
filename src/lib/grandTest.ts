/**
 * Grand Test — full-syllabus, negative-marked papers that are identical for
 * every student (so rank and percentile actually mean something).
 *
 * Papers are built deterministically from the published question bank with a
 * fixed seed, so the same Grand Test id always contains the same questions on
 * every device, on the server and on the client.
 */
import { useEffect, useState } from "react";
import type { Question } from "./curriculum";
import { SUBJECTS } from "./curriculum";
import { seededShuffle } from "./questions";
import { supabase } from "@/lib/supabase";
import { EXAM_MODES } from "./examModes";

const GRAND_SEED = 90210;

export type GrandTest = {
  id: string;
  title: string;
  subtitle: string;
  questionIds: string[];
  minutes: number;
};

/** Grand Test id used by the Exam Day Simulator (3-hour paper). */
export const SIMULATOR_PREFIX = "sim";
export const GRAND_PREFIX = "gt";

function sortedById(pool: Question[]) {
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Picks a balanced full-syllabus slice: every subject contributes in
 * proportion to its share of the bank, so no paper is single-subject heavy.
 */
function balancedSlice(pool: Question[], size: number, seed: number, skip: number): Question[] {
  const bySubject = SUBJECTS.map((s) => ({
    subject: s.id,
    items: seededShuffle(
      sortedById(pool.filter((q) => q.subjectId === s.id)),
      seed + s.id.length,
    ),
  })).filter((b) => b.items.length > 0);
  if (bySubject.length === 0) return [];

  const perSubject = Math.floor(size / bySubject.length);
  const out: Question[] = [];
  const used = new Set<string>();

  for (const bucket of bySubject) {
    const start = (skip * perSubject) % Math.max(1, bucket.items.length);
    for (let i = 0; i < perSubject; i++) {
      const q = bucket.items[(start + i) % bucket.items.length];
      if (!q || used.has(q.id)) continue;
      used.add(q.id);
      out.push(q);
    }
  }

  // Top up from the whole bank if a subject ran short.
  const rest = seededShuffle(sortedById(pool), seed + 7);
  for (const q of rest) {
    if (out.length >= size) break;
    if (used.has(q.id)) continue;
    used.add(q.id);
    out.push(q);
  }
  return seededShuffle(out, seed + 13).slice(0, size);
}

/** How many Grand Tests the current question bank can support (max 6). */
export function buildGrandTests(pool: Question[]): GrandTest[] {
  const cfg = EXAM_MODES.grand;
  if (pool.length < cfg.questions) return [];
  const possible = Math.min(6, Math.max(1, Math.floor(pool.length / cfg.questions)));
  const out: GrandTest[] = [];
  for (let n = 0; n < possible; n++) {
    const slice = balancedSlice(pool, cfg.questions, GRAND_SEED + n * 101, n);
    if (slice.length < cfg.questions) break;
    out.push({
      id: `${GRAND_PREFIX}-${n + 1}`,
      title: `Grand Test ${n + 1}`,
      subtitle: "All subjects · negative marking · ranked",
      questionIds: slice.map((q) => q.id),
      minutes: cfg.minutes,
    });
  }
  return out;
}

/** Exam Day Simulator papers — 3 hours, longer, randomized at attempt time. */
export function buildSimulators(pool: Question[]): GrandTest[] {
  const cfg = EXAM_MODES.simulator;
  const size = Math.min(cfg.questions, pool.length);
  if (size < 20) return [];
  const count = Math.min(3, Math.max(1, Math.floor(pool.length / Math.max(20, size))));
  const out: GrandTest[] = [];
  for (let n = 0; n < count; n++) {
    const slice = balancedSlice(pool, size, GRAND_SEED + 5000 + n * 211, n);
    if (slice.length < 20) break;
    out.push({
      id: `${SIMULATOR_PREFIX}-${n + 1}`,
      title: `Exam Day Simulator ${n + 1}`,
      subtitle: "3 hours · no pause · randomized order",
      questionIds: slice.map((q) => q.id),
      minutes: cfg.minutes,
    });
  }
  return out;
}

export function findGrandPaper(pool: Question[], id: string): GrandTest | null {
  const list = id.startsWith(SIMULATOR_PREFIX) ? buildSimulators(pool) : buildGrandTests(pool);
  return list.find((t) => t.id === id) ?? null;
}

export function questionsForPaper(pool: Question[], paper: GrandTest): Question[] {
  const byId = new Map(pool.map((q) => [q.id, q]));
  return paper.questionIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);
}

/* --------------------------- rank & percentile --------------------------- */

export type RankInfo = {
  /** 1-based rank among everyone who attempted this paper. */
  rank: number;
  /** Number of students in the pool the rank was computed against. */
  total: number;
  /** 0–100, higher is better. */
  percentile: number;
  topScore: number;
  averageScore: number;
  /** "cloud" = real students, "estimated" = benchmark curve (offline / no data). */
  source: "cloud" | "estimated";
  loading: boolean;
};

/**
 * Benchmark curve used when cloud results are unavailable (offline, signed
 * out, or you are the first attempt). Modelled on a tough board-level paper:
 * most students land in the 45–65% band.
 */
function estimatedPercentile(percent: number) {
  const mean = 54;
  const spread = 16;
  const z = (percent - mean) / spread;
  // Logistic CDF approximation of a normal distribution.
  const p = 1 / (1 + Math.exp(-1.702 * z));
  return Math.max(1, Math.min(99.9, Math.round(p * 1000) / 10));
}

export function percentileFromScores(scores: number[], mine: number) {
  if (scores.length === 0) return estimatedPercentile(mine);
  const below = scores.filter((s) => s < mine).length;
  const same = scores.filter((s) => s === mine).length;
  return Math.round(((below + same / 2) / scores.length) * 1000) / 10;
}

type RankRow = { user_id: string; best_percent: number | string | null };

/**
 * Live rank + percentile for a ranked paper.
 *
 * Uses the `get_test_rank` cloud function when it is available (it returns one
 * best score per student for the paper). Falls back to the benchmark curve so
 * the result screen always shows something useful offline.
 */
export function useGrandRank(testId: string | null, myPercent: number, enabled = true): RankInfo {
  const [info, setInfo] = useState<RankInfo>({
    rank: 1,
    total: 1,
    percentile: estimatedPercentile(myPercent),
    topScore: myPercent,
    averageScore: myPercent,
    source: "estimated",
    loading: !!testId && enabled,
  });

  useEffect(() => {
    if (!testId || !enabled) return;
    let active = true;

    void (async () => {
      try {
        // `get_test_rank` ships in supabase/migrations — cast until the
        // generated types are refreshed against the project.
        const rpc = supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => PromiseLike<{ data: unknown; error: unknown }>;
        const { data, error } = await rpc("get_test_rank", { _test_id: testId });
        if (!active) return;
        const rows = (data ?? []) as RankRow[];
        if (error || rows.length === 0) throw new Error("no cloud results");
        const scores = rows.map((r) => Number(r.best_percent ?? 0));
        const others = scores.slice();
        const better = others.filter((s) => s > myPercent).length;
        setInfo({
          rank: better + 1,
          total: Math.max(others.length, 1),
          percentile: percentileFromScores(others, myPercent),
          topScore: Math.max(...others, myPercent),
          averageScore: Math.round((others.reduce((a, b) => a + b, 0) / others.length) * 10) / 10,
          source: "cloud",
          loading: false,
        });
      } catch {
        if (!active) return;
        const pct = estimatedPercentile(myPercent);
        setInfo({
          rank: 1,
          total: 1,
          percentile: pct,
          topScore: myPercent,
          averageScore: 54,
          source: "estimated",
          loading: false,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [testId, myPercent, enabled]);

  return info;
}
