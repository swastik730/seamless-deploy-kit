/**
 * Hard mode — one place that decides how tough BoardBuddy is.
 *
 * The app is deliberately harder than the real board paper: papers are longer,
 * the timer is tighter, wrong answers cost marks, and a chapter is only
 * "covered" after repeated high-accuracy practice. A student who scores 90 here
 * should comfortably cross 95+ in the board exam.
 */
import type { Difficulty, Question } from "./curriculum";
import { seededShuffle } from "./questions";

export const HARD = {
  /** Questions in a chapter / subject quiz. */
  quizQuestions: 15,
  /** Countdown per question in a quiz (seconds) — tighter than board pace. */
  quizSecondsPerQuestion: 40,
  /** Marks deducted for every wrong answer (board has none — we do). */
  negativeMark: 0.25,
  /** Percentage needed to "pass" a paper in the app. */
  passPercent: 75,
  /** Accuracy needed before a chapter counts as covered. */
  masteryAccuracy: 0.85,
  /** Separate practice sessions needed on that chapter. */
  masteryAttempts: 2,
  /** Minimum questions attempted on the chapter across those sessions. */
  masteryMinQuestions: 20,
  /** Difficulty mix used whenever we build a paper (easy / medium / hard). */
  mix: { easy: 0.1, medium: 0.35, hard: 0.55 },
  /** Seconds per question in mock tests. */
  testSecondsPerQuestion: 45,
} as const;

/** Marking rule label shown in exam headers. */
export const MARKING_LABEL = `1 mark · −${HARD.negativeMark} wrong`;

/**
 * Picks `count` questions with a hard-first difficulty mix, preferring
 * questions the student has not seen yet. Backfills from whatever is left when
 * the bank does not have enough of a difficulty.
 */
export function pickHard(
  pool: Question[],
  count: number,
  seed: number,
  seenIds: Set<string> = new Set(),
): Question[] {
  const shuffled = seededShuffle(pool, seed || 1);
  const ordered = [...shuffled.filter((q) => !seenIds.has(q.id)), ...shuffled.filter((q) => seenIds.has(q.id))];
  const buckets: Record<Difficulty, Question[]> = {
    easy: ordered.filter((q) => q.difficulty === "easy"),
    medium: ordered.filter((q) => q.difficulty === "medium"),
    hard: ordered.filter((q) => q.difficulty === "hard"),
  };

  const out: Question[] = [];
  const used = new Set<string>();
  const take = (level: Difficulty, n: number) => {
    for (const q of buckets[level]) {
      if (out.length >= count || n <= 0) break;
      if (used.has(q.id)) continue;
      used.add(q.id);
      out.push(q);
      n -= 1;
    }
  };

  take("hard", Math.round(count * HARD.mix.hard));
  take("medium", Math.round(count * HARD.mix.medium));
  take("easy", count - out.length);

  // Backfill hardest-first so a thin bank still produces a tough paper.
  for (const level of ["hard", "medium", "easy"] as Difficulty[]) {
    if (out.length >= count) break;
    take(level, count - out.length);
  }
  return out.slice(0, count);
}

/** Net marks after negative marking (never below 0). */
export function netScore(correct: number, wrong: number) {
  return Math.max(0, correct - wrong * HARD.negativeMark);
}

/** Net percentage of a paper after negative marking. */
export function netPercent(correct: number, wrong: number, total: number) {
  if (!total) return 0;
  return Math.round((netScore(correct, wrong) / total) * 100);
}

/** Strict grade bands — 75% is the pass line, 90+ is rare. */
export function gradeBand(pct: number) {
  if (pct >= 90) return { label: "Board ready 🏆", tone: "success" as const };
  if (pct >= HARD.passPercent) return { label: "Passed — keep pushing 🎯", tone: "primary" as const };
  if (pct >= 50) return { label: "Below the pass line 💪", tone: "achievement" as const };
  return { label: "Needs serious revision 📚", tone: "destructive" as const };
}
