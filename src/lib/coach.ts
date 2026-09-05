/**
 * Personal Revision Coach.
 *
 * Keeps a tiny local plan (board exam date + how many minutes a student can
 * study today) and turns it, together with the weak-chapter engine, into a
 * concrete daily revision queue. Free for every user — no premium gate.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { Question } from "./curriculum";
import { SUBJECTS, getSubject, questionsFor } from "./curriculum";
import { useAppState } from "./store";
import type { WeakChapter } from "./weakChapters";

export type CoachPlan = {
  /** yyyy-mm-dd of the first board paper, or null when not set yet. */
  examDate: string | null;
  /** Minutes the student can realistically study each day. */
  dailyMinutes: number;
};

const KEY = "tenbuddy.coach.v1";

const DEFAULT_PLAN: CoachPlan = { examDate: null, dailyMinutes: 60 };

let plan: CoachPlan = DEFAULT_PLAN;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) plan = { ...DEFAULT_PLAN, ...(JSON.parse(raw) as Partial<CoachPlan>) };
      } catch {
        plan = DEFAULT_PLAN;
      }
    }
    queueMicrotask(emit);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCoachPlan(): CoachPlan {
  return useSyncExternalStore(
    subscribe,
    () => plan,
    () => DEFAULT_PLAN,
  );
}

export function saveCoachPlan(patch: Partial<CoachPlan>) {
  plan = { ...plan, ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(plan));
    } catch {
      /* storage unavailable */
    }
  }
  emit();
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export type CoachTask = {
  id: string;
  kind: "drill" | "chapter-quiz" | "mock" | "revise";
  title: string;
  detail: string;
  minutes: number;
  /** Deep link target. */
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

const CHAPTER_QUIZ_MINUTES = 15;
const DRILL_MINUTES = 20;
const MOCK_MINUTES = 45;

/** Rotates the daily focus so the same chapter isn't repeated every morning. */
function dayIndex() {
  return Math.floor(Date.now() / 86_400_000);
}

/**
 * Builds today's revision queue from weak chapters, past mistakes, the days
 * left before the exam and the minutes the student has available.
 */
export function buildDailyQueue(
  weak: WeakChapter[],
  dailyMinutes: number,
  daysLeft: number | null,
  untouchedChapters: { chapterId: string; chapterName: string; subjectId: string; subjectName: string }[],
): CoachTask[] {
  const tasks: CoachTask[] = [];
  let budget = Math.max(15, dailyMinutes);
  const rotate = dayIndex();

  const push = (task: CoachTask) => {
    if (budget - task.minutes < -5) return;
    budget -= task.minutes;
    tasks.push(task);
  };

  // 1. Re-test actual mistakes first — highest value per minute.
  if (weak.some((w) => w.wrongQuestionIds.length > 0)) {
    push({
      id: "drill",
      kind: "drill",
      title: "Weak-Chapter Drill",
      detail: "A fresh paper built from the questions you got wrong.",
      minutes: DRILL_MINUTES,
      to: "/exam/run",
      search: { mode: "drill", paper: "drill" },
    });
  }

  // 2. Two weakest chapters, rotated daily so coverage spreads out.
  const ranked = weak.slice(0, 6);
  for (let i = 0; i < Math.min(2, ranked.length); i++) {
    const w = ranked[(rotate + i) % ranked.length];
    if (!w) continue;
    if (tasks.some((t) => t.id === `chapter:${w.chapterId}`)) continue;
    push({
      id: `chapter:${w.chapterId}`,
      kind: "chapter-quiz",
      title: `${w.chapterName}`,
      detail: `${getSubject(w.subjectId)?.name ?? w.subjectName} · ${w.accuracy}% accuracy so far`,
      minutes: CHAPTER_QUIZ_MINUTES,
      to: "/quiz/$subjectId",
      params: { subjectId: w.subjectId },
      search: { chapter: w.chapterId },
    });
  }

  // 3. Cover something never attempted yet.
  const fresh = untouchedChapters[rotate % Math.max(1, untouchedChapters.length)];
  if (fresh && budget >= CHAPTER_QUIZ_MINUTES) {
    push({
      id: `new:${fresh.chapterId}`,
      kind: "revise",
      title: `New chapter: ${fresh.chapterName}`,
      detail: `${fresh.subjectName} · you haven't practised this one yet`,
      minutes: CHAPTER_QUIZ_MINUTES,
      to: "/quiz/$subjectId",
      params: { subjectId: fresh.subjectId },
      search: { chapter: fresh.chapterId },
    });
  }

  // 4. Full mock when there is time, or when the exam is close.
  const mockDay = daysLeft !== null && daysLeft <= 30 ? true : rotate % 3 === 0;
  if (mockDay && budget >= MOCK_MINUTES - 10) {
    push({
      id: "mock",
      kind: "mock",
      title: "Full-syllabus mock test",
      detail: daysLeft !== null && daysLeft <= 30 ? "Exam is close — practise the full paper." : "Build exam stamina.",
      minutes: MOCK_MINUTES,
      to: "/tests",
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      id: "start",
      kind: "chapter-quiz",
      title: "Start with a mixed quiz",
      detail: "Attempt 15 mixed questions so the coach can find your weak areas.",
      minutes: CHAPTER_QUIZ_MINUTES,
      to: "/quiz/$subjectId",
      params: { subjectId: "mixed" },
    });
  }

  return tasks;
}

/** Chapters the student has never answered a question from. */
export function useUntouchedChapters(pool: Question[]) {
  const state = useAppState();
  return useMemo(() => {
    const byQuestion = new Map(pool.map((q) => [q.id, q]));
    const touched = new Set<string>();
    for (const attempt of state.attempts) {
      for (const item of attempt.perQuestion) {
        const chapterId = byQuestion.get(item.questionId)?.chapterId ?? attempt.chapterId;
        if (chapterId) touched.add(chapterId);
      }
    }
    const out: { chapterId: string; chapterName: string; subjectId: string; subjectName: string }[] = [];
    for (const s of SUBJECTS) {
      for (const c of s.chapters) {
        if (touched.has(c.id)) continue;
        if (questionsFor({ chapterId: c.id }).length === 0) continue;
        out.push({ chapterId: c.id, chapterName: c.name, subjectId: s.id, subjectName: s.name });
      }
    }
    return out;
  }, [state.attempts, pool]);
}

/** Weekly syllabus-coverage estimate used on the coach dashboard. */
export function coverageStats(weak: WeakChapter[], totalChapters: number) {
  const covered = weak.length;
  const strong = weak.filter((w) => w.accuracy >= 75).length;
  return {
    covered,
    strong,
    percent: totalChapters ? Math.round((covered / totalChapters) * 100) : 0,
  };
}
