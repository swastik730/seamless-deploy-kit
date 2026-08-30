/**
 * Exam modes — one place that defines how the three high-stakes exam
 * experiences behave (Grand Test, Exam Day Simulator, Adaptive Weak-Chapter
 * Drill). Every runner reads its rules from here so behaviour never drifts.
 */
import { HARD } from "./difficulty";

export type ExamMode = "grand" | "simulator" | "drill";

export type ExamModeConfig = {
  id: ExamMode;
  name: string;
  tagline: string;
  /** Number of questions in the paper. */
  questions: number;
  /** Total duration in minutes. */
  minutes: number;
  /** Marks deducted per wrong answer. */
  negative: number;
  /** Marks awarded per correct answer. */
  positive: number;
  /** Options + question order reshuffled per attempt. */
  randomize: boolean;
  /** Anti-cheat monitoring switched on. */
  antiCheat: boolean;
  /** Tab switches allowed before the paper auto-submits. */
  maxViolations: number;
  /** Seconds burnt from the clock for every violation. */
  penaltySeconds: number;
  /** No pause / no exit — full lock-screen warning behaviour. */
  lockScreen: boolean;
  /** Rank + percentile published against every other student. */
  ranked: boolean;
};

export const EXAM_MODES: Record<ExamMode, ExamModeConfig> = {
  grand: {
    id: "grand",
    name: "Grand Test",
    tagline: "Full syllabus · negative marking · percentile & rank",
    questions: 60,
    minutes: 75,
    negative: HARD.negativeMark,
    positive: 1,
    randomize: false,
    antiCheat: true,
    maxViolations: 3,
    penaltySeconds: 60,
    lockScreen: false,
    ranked: true,
  },
  simulator: {
    id: "simulator",
    name: "Exam Day Simulator",
    tagline: "3 hours · randomized paper · no pause, no exit",
    questions: 100,
    minutes: 180,
    negative: HARD.negativeMark,
    positive: 1,
    randomize: true,
    antiCheat: true,
    maxViolations: 3,
    penaltySeconds: 120,
    lockScreen: true,
    ranked: true,
  },
  drill: {
    id: "drill",
    name: "Weak-Chapter Drill",
    tagline: "Built from your own mistakes · adaptive every attempt",
    questions: 20,
    minutes: 25,
    negative: HARD.negativeMark,
    positive: 1,
    randomize: true,
    antiCheat: false,
    maxViolations: 0,
    penaltySeconds: 0,
    lockScreen: false,
    ranked: false,
  },
};

export function isExamMode(value: unknown): value is ExamMode {
  return value === "grand" || value === "simulator" || value === "drill";
}

/** Net marks after negative marking, floored at 0. */
export function examMarks(cfg: ExamModeConfig, correct: number, wrong: number) {
  return Math.max(0, correct * cfg.positive - wrong * cfg.negative);
}

/** Net percentage of the paper after negative marking. */
export function examPercent(cfg: ExamModeConfig, correct: number, wrong: number, total: number) {
  if (!total) return 0;
  return Math.round((examMarks(cfg, correct, wrong) / (total * cfg.positive)) * 1000) / 10;
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
