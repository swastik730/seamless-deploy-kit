/**
 * Adaptive weak-chapter engine.
 *
 * Reads every attempt the student has made, maps each answered question back to
 * its chapter, and ranks chapters by how badly they are going. Those rankings
 * drive the Weak-Chapter Drill (a fresh paper built from your own mistakes) and
 * the "weak topics over time" chart.
 */
import { useMemo } from "react";
import type { Question } from "./curriculum";
import { SUBJECTS, getSubject } from "./curriculum";
import { seededShuffle } from "./questions";
import { useAppState, type Attempt } from "./store";

export type WeakChapter = {
  chapterId: string;
  chapterName: string;
  subjectId: string;
  subjectName: string;
  answered: number;
  correct: number;
  wrong: number;
  accuracy: number;
  /** Questions in this chapter the student got wrong at least once. */
  wrongQuestionIds: string[];
  lastAttemptedAt: string | null;
  /** 0–100, higher = more urgent. */
  urgency: number;
};

const CHAPTER_INDEX = (() => {
  const map = new Map<string, { chapterName: string; subjectId: string; subjectName: string }>();
  for (const s of SUBJECTS) {
    for (const c of s.chapters) {
      map.set(c.id, { chapterName: c.name, subjectId: s.id, subjectName: s.name });
    }
  }
  return map;
})();

/** Minimum answered questions before a chapter is judged. */
const MIN_SAMPLE = 3;

export function computeWeakChapters(attempts: Attempt[], pool: Question[]): WeakChapter[] {
  const byQuestion = new Map(pool.map((q) => [q.id, q]));
  type Acc = {
    answered: number;
    correct: number;
    wrongIds: Set<string>;
    last: string | null;
  };
  const acc = new Map<string, Acc>();

  for (const attempt of attempts) {
    for (const item of attempt.perQuestion) {
      // Skipped questions don't prove weakness — only judge answered ones.
      if (item.answered === false) continue;
      const q = byQuestion.get(item.questionId);
      const chapterId = q?.chapterId ?? attempt.chapterId;
      if (!chapterId) continue;
      const cur = acc.get(chapterId) ?? { answered: 0, correct: 0, wrongIds: new Set(), last: null };
      cur.answered += 1;
      if (item.correct) cur.correct += 1;
      else cur.wrongIds.add(item.questionId);
      if (!cur.last || attempt.date > cur.last) cur.last = attempt.date;
      acc.set(chapterId, cur);
    }
  }

  const out: WeakChapter[] = [];
  for (const [chapterId, v] of acc) {
    const meta = CHAPTER_INDEX.get(chapterId);
    if (!meta) continue;
    const accuracy = v.answered ? Math.round((v.correct / v.answered) * 100) : 0;
    const wrong = v.answered - v.correct;
    const volumeWeight = Math.min(1, v.answered / 10);
    const urgency = Math.round((100 - accuracy) * (0.6 + 0.4 * volumeWeight));
    out.push({
      chapterId,
      chapterName: meta.chapterName,
      subjectId: meta.subjectId,
      subjectName: meta.subjectName,
      answered: v.answered,
      correct: v.correct,
      wrong,
      accuracy,
      wrongQuestionIds: [...v.wrongIds],
      lastAttemptedAt: v.last,
      urgency,
    });
  }

  return out
    .filter((c) => c.answered >= MIN_SAMPLE)
    .sort((a, b) => b.urgency - a.urgency || b.wrong - a.wrong);
}

export function useWeakChapters(pool: Question[]) {
  const state = useAppState();
  return useMemo(() => computeWeakChapters(state.attempts, pool), [state.attempts, pool]);
}

/** Weekly accuracy trend for the student's weakest chapters. */
export type TrendPoint = { label: string; accuracy: number; answered: number };

export function useWeakTrend(weeks = 6): TrendPoint[] {
  const state = useAppState();
  return useMemo(() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const buckets: TrendPoint[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = now - (i + 1) * week;
      const end = now - i * week;
      const inRange = state.attempts.filter((a) => {
        const t = new Date(a.date).getTime();
        return t >= start && t < end;
      });
      const answered = inRange.reduce((n, a) => n + (a.total - a.unanswered), 0);
      const correct = inRange.reduce((n, a) => n + a.correct, 0);
      buckets.push({
        label: i === 0 ? "This week" : `${i}w ago`,
        accuracy: answered ? Math.round((correct / answered) * 100) : 0,
        answered,
      });
    }
    return buckets;
  }, [state.attempts, weeks]);
}

/**
 * Builds an adaptive drill paper.
 *
 * Priority order:
 *  1. Questions you actually got wrong (re-test the exact mistake).
 *  2. Unseen questions from your weakest chapters (same weakness, new question).
 *  3. Any question from those chapters, then anything left in the bank.
 */
export function buildDrillPaper(
  pool: Question[],
  weak: WeakChapter[],
  count: number,
  seed: number,
  seenIds: Set<string> = new Set(),
): Question[] {
  const byId = new Map(pool.map((q) => [q.id, q]));
  const focus = weak.slice(0, 6);
  const focusIds = new Set(focus.map((w) => w.chapterId));

  const mistakes = seededShuffle(
    focus.flatMap((w) => w.wrongQuestionIds).map((id) => byId.get(id)).filter((q): q is Question => !!q),
    seed || 1,
  );

  const chapterPool = seededShuffle(
    pool.filter((q) => focusIds.has(q.chapterId)),
    (seed || 1) + 31,
  );
  const freshFromWeak = chapterPool.filter((q) => !seenIds.has(q.id));
  const restFromWeak = chapterPool.filter((q) => seenIds.has(q.id));
  const anything = seededShuffle(pool, (seed || 1) + 97);

  const out: Question[] = [];
  const used = new Set<string>();
  const mistakeBudget = Math.ceil(count * 0.5);

  const push = (list: Question[], limit: number) => {
    for (const q of list) {
      if (out.length >= count || limit <= 0) break;
      if (used.has(q.id)) continue;
      used.add(q.id);
      out.push(q);
      limit -= 1;
    }
  };

  push(mistakes, mistakeBudget);
  push(freshFromWeak, count - out.length);
  push(restFromWeak, count - out.length);
  push(anything, count - out.length);

  return out.slice(0, count);
}

/** Chapter-level recommendation text used on result screens and PDF reports. */
export function nextPracticeAdvice(weak: WeakChapter[]): string[] {
  if (weak.length === 0) {
    return [
      "Not enough data yet — attempt a Grand Test or two chapter quizzes so we can find your weak spots.",
    ];
  }
  return weak.slice(0, 3).map((w) => {
    const subject = getSubject(w.subjectId)?.name ?? w.subjectName;
    return `${subject} · ${w.chapterName} — ${w.accuracy}% accuracy over ${w.answered} questions. Run a 20-question drill on this chapter next.`;
  });
}
