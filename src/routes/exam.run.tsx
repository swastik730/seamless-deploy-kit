import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  Maximize,
  ShieldCheck,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AttemptGuard } from "@/components/exam/AttemptGuard";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { ResultBreakdown } from "@/components/exam/ResultBreakdown";
import { SolutionCard } from "@/components/exam/SolutionCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Question } from "@/lib/curriculum";
import { buildAttemptReport, downloadAttemptPdf } from "@/lib/attemptReport";
import { gradeBand } from "@/lib/difficulty";
import { EXAM_MODES, examMarks, examPercent, formatClock, isExamMode } from "@/lib/examModes";
import { useExamSecurity, violationLabel } from "@/lib/examSecurity";
import { findGrandPaper, questionsForPaper, useGrandRank } from "@/lib/grandTest";
import { dedupeQuestions, seededShuffle, useQuestionPool, useShuffleSeed } from "@/lib/questions";
import { recordAttempt, toggleBookmark, useAppState, useSeenQuestionIds, type Attempt } from "@/lib/store";
import { buildDrillPaper, useWeakChapters } from "@/lib/weakChapters";

type Search = {
  mode: "grand" | "simulator" | "drill";
  paper: string;
  done?: "1" | undefined;
};

export const Route = createFileRoute("/exam/run")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    mode: isExamMode(search["mode"]) ? search["mode"] : "grand",
    paper: typeof search["paper"] === "string" ? search["paper"] : "",
    done: search["done"] === "1" ? ("1" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Exam in progress | BoardBuddy" },
      {
        name: "description",
        content: "Ranked exam runner with anti-cheat monitoring, negative marking and instant analysis.",
      },
      { property: "og:title", content: "Exam in progress | BoardBuddy" },
      { property: "og:description", content: "Ranked exam with anti-cheat and instant analysis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExamRun,
});

function ExamRun() {
  const search = Route.useSearch();
  const cfg = EXAM_MODES[search.mode];
  const { pool, loading } = useQuestionPool();
  const [seed] = useShuffleSeed();
  const seen = useSeenQuestionIds();
  const weak = useWeakChapters(pool);

  const paperTitle = useMemo(() => {
    if (search.mode === "drill") return "Weak-Chapter Drill";
    const found = loading ? null : findGrandPaper(pool, search.paper);
    return found?.title ?? cfg.name;
  }, [search.mode, search.paper, pool, loading, cfg.name]);

  const seenRef = useRef(seen);
  seenRef.current = seen;
  const weakRef = useRef(weak);
  weakRef.current = weak;

  // The paper is built once and frozen for the whole attempt.
  const [paper, setPaper] = useState<{ key: string; questions: Question[] } | null>(null);
  const runKey = `${search.mode}:${search.paper}`;

  useEffect(() => {
    if (loading || search.done) return;
    if (paper && paper.key === runKey) return;

    let built: Question[] = [];
    if (search.mode === "drill") {
      built = buildDrillPaper(pool, weakRef.current, cfg.questions, seed || 1, seenRef.current);
    } else {
      const found = findGrandPaper(pool, search.paper);
      built = found ? questionsForPaper(pool, found) : [];
      if (cfg.randomize) built = seededShuffle(built, (seed || 1) + 17);
    }
    setPaper({ key: runKey, questions: dedupeQuestions(built) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pool, runKey, search.done]);

  if (search.done) {
    return (
      <AppShell title={paperTitle}>
        <div className="surface mx-auto max-w-lg p-6 text-center">
          <span className="brand-gradient mx-auto grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <p className="mt-3 text-sm font-bold">This exam is already submitted</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A ranked paper can&apos;t be reopened. Pick a fresh paper from the Exam Hub.
          </p>
          <Link
            to="/exam"
            className="brand-gradient mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Back to Exam Hub
          </Link>
        </div>
      </AppShell>
    );
  }

  if (loading || !paper || paper.key !== runKey) {
    return (
      <AppShell title={paperTitle}>
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing your paper…
        </p>
      </AppShell>
    );
  }

  if (paper.questions.length === 0) {
    return (
      <AppShell title={paperTitle}>
        <div className="surface mx-auto max-w-lg p-6 text-center">
          <p className="text-sm font-bold">This paper isn&apos;t available yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The question bank needs more published questions for {cfg.name}.
          </p>
          <Link
            to="/exam"
            className="brand-gradient mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Back to Exam Hub
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <Runner
      key={runKey}
      questions={paper.questions}
      search={search}
      title={paperTitle}
      pool={pool}
    />
  );
}

function Runner({
  questions,
  search,
  title,
  pool,
}: {
  questions: Question[];
  search: Search;
  title: string;
  pool: Question[];
}) {
  const cfg = EXAM_MODES[search.mode];
  const navigate = useNavigate();
  const state = useAppState();

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [times, setTimes] = useState<Record<string, number>>({});
  const [left, setLeft] = useState(cfg.minutes * 60);
  const [finished, setFinished] = useState(false);

  const security = useExamSecurity({
    active: cfg.antiCheat && started && !finished,
    maxViolations: cfg.maxViolations,
    penaltySeconds: cfg.penaltySeconds,
    lockScreen: cfg.lockScreen,
    onPenalty: (seconds) => setLeft((s) => Math.max(0, s - seconds)),
    onAutoSubmit: () => setFinished(true),
  });

  // Countdown clock.
  useEffect(() => {
    if (!started || finished) return;
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setFinished(true);
          return 0;
        }
        return s - 1;
      });
      const q = questions[index];
      if (q) setTimes((m) => ({ ...m, [q.id]: (m[q.id] ?? 0) + 1 }));
    }, 1000);
    return () => clearInterval(t);
  }, [started, finished, index, questions]);

  const correctCount = questions.filter((q) => answers[q.id] === q.answer).length;
  const attempted = questions.filter((q) => answers[q.id] !== undefined).length;
  const wrongCount = attempted - correctCount;
  const spent = cfg.minutes * 60 - left;
  const percent = examPercent(cfg, correctCount, wrongCount, questions.length);
  const marks = examMarks(cfg, correctCount, wrongCount);

  const rank = useGrandRank(cfg.ranked && finished ? search.paper : null, percent, cfg.ranked && finished);

  // Persisted attempt (also used to build the PDF report).
  const attemptRef = useRef<Attempt | null>(null);
  if (finished && !attemptRef.current) {
    attemptRef.current = {
      id: crypto.randomUUID(),
      mode: search.mode,
      label: title,
      subjectId: "mixed",
      testId: search.paper || undefined,
      total: questions.length,
      correct: correctCount,
      unanswered: questions.length - attempted,
      seconds: spent,
      date: new Date().toISOString(),
      perQuestion: questions.map((q) => ({
        questionId: q.id,
        difficulty: q.difficulty,
        correct: answers[q.id] === q.answer,
        answered: answers[q.id] !== undefined,
      })),
    };
  }

  useEffect(() => {
    if (!finished) return;
    void security.exitFullscreen();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("done", "1");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* non-browser environment */
    }
    const a = attemptRef.current;
    if (!a) return;
    recordAttempt({
      mode: a.mode,
      label: a.label,
      subjectId: a.subjectId,
      testId: a.testId,
      total: a.total,
      correct: a.correct,
      unanswered: a.unanswered,
      seconds: a.seconds,
      perQuestion: a.perQuestion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* ── Pre-start instructions ─────────────────────────────────────── */
  if (!started) {
    return (
      <AppShell title={title}>
        <div className="surface mx-auto max-w-xl p-5 sm:p-6">
          <span className="brand-gradient grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{cfg.tagline}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Questions" value={String(questions.length)} />
            <Fact label="Duration" value={formatClock(cfg.minutes * 60)} />
            <Fact label="Correct" value={`+${cfg.positive}`} />
            <Fact label="Wrong" value={`−${cfg.negative}`} />
          </dl>

          <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
            {cfg.antiCheat && (
              <li className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                Anti-cheat is on: leaving the tab or window costs {cfg.penaltySeconds}s each time, and the
                paper auto-submits on violation {cfg.maxViolations}.
              </li>
            )}
            {cfg.lockScreen && (
              <li className="flex gap-2">
                <Maximize className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hero-purple" />
                Exam-lock mode: the paper runs fullscreen with no pause, and closing the tab shows a
                warning.
              </li>
            )}
            {cfg.ranked && (
              <li className="flex gap-2">
                <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hero-amber" />
                Ranked paper — your percentile and rank are published against every other student.
              </li>
            )}
            <li className="flex gap-2">
              <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              A full PDF report is downloadable right after you submit.
            </li>
          </ul>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/exam"
              className="grid h-12 flex-1 place-items-center rounded-xl border border-input text-sm font-bold"
            >
              Not now
            </Link>
            <button
              type="button"
              onClick={() => {
                setStarted(true);
                if (cfg.lockScreen) void security.enterFullscreen();
              }}
              className="brand-gradient grid h-12 flex-1 place-items-center rounded-xl text-sm font-extrabold text-primary-foreground"
            >
              Start exam
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ── Result screen ──────────────────────────────────────────────── */
  if (finished) {
    const band = gradeBand(percent);
    const report = attemptRef.current
      ? buildAttemptReport(attemptRef.current, pool, {
          studentName: state.name,
          allAttempts: state.attempts,
          ...(cfg.ranked
            ? {
                rank: {
                  rank: rank.rank,
                  total: rank.total,
                  percentile: rank.percentile,
                  source: rank.source,
                },
              }
            : {}),
          violations: cfg.antiCheat ? security.violations.length : undefined,
        })
      : null;

    return (
      <AppShell title={`${cfg.name} Result`}>
        <div className="brand-gradient mb-4 rounded-3xl p-6 text-center text-primary-foreground">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20">
            <Trophy className="h-8 w-8" />
          </span>
          <h2 className="mt-3 text-2xl font-extrabold">{band.label}</h2>
          <p className="text-xs opacity-90">{title}</p>
          <p className="mt-4 text-5xl font-extrabold tabular-nums">{percent}%</p>
          <p className="text-xs font-semibold opacity-90">
            {marks.toFixed(2)} / {questions.length} marks · {correctCount} correct · {wrongCount} wrong
            (−{cfg.negative} each)
          </p>
        </div>

        {cfg.ranked && (
          <div className="surface mb-4 p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-reward-soft text-hero-purple">
                <Users className="h-4 w-4" />
              </span>
              <p className="text-sm font-extrabold">Rank &amp; percentile</p>
              {rank.loading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Cell label="Rank" value={`#${rank.rank}`} />
              <Cell label="Percentile" value={`${rank.percentile}`} />
              <Cell label="Students" value={String(rank.total)} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {rank.source === "cloud"
                ? `Live ranking · top score ${rank.topScore}% · average ${rank.averageScore}%`
                : "Estimated from the board-level benchmark curve — sign in and stay online for live ranking."}
            </p>
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div className="surface p-3">
            <p className="text-xl font-extrabold text-success">{correctCount}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">Correct</p>
          </div>
          <div className="surface p-3">
            <p className="text-xl font-extrabold text-destructive">{wrongCount}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">Incorrect</p>
          </div>
          <div className="surface p-3">
            <p className="text-xl font-extrabold text-muted-foreground">
              {questions.length - attempted}
            </p>
            <p className="text-[11px] font-semibold text-muted-foreground">Skipped</p>
          </div>
        </div>

        <div className="surface mb-4 divide-y divide-border">
          <Row label="Time taken" value={formatClock(spent)} icon={<Timer className="h-4 w-4" />} />
          <Row
            label="Accuracy on attempted"
            value={`${attempted ? Math.round((correctCount / attempted) * 100) : 0}%`}
          />
          {cfg.antiCheat && (
            <Row
              label="Anti-cheat violations"
              value={`${security.violations.length}${
                security.penaltyTotal ? ` · −${formatClock(security.penaltyTotal)} clock` : ""
              }`}
            />
          )}
        </div>

        <div className="surface mb-4 space-y-2 p-4">
          <button
            type="button"
            disabled={!report}
            onClick={() => {
              if (!report) return;
              void downloadAttemptPdf(report).catch(() =>
                toast.error("Could not create the PDF", { description: "Please try again." }),
              );
            }}
            className="brand-gradient grid h-12 w-full place-items-center rounded-xl text-sm font-extrabold text-primary-foreground disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> Download PDF report
            </span>
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void navigate({ to: "/exam" })}
              className="h-11 flex-1 rounded-xl border border-input text-sm font-bold"
            >
              More exams
            </button>
            <Link
              to="/analysis"
              className="grid h-11 flex-1 place-items-center rounded-xl border border-input text-sm font-bold"
            >
              See analysis
            </Link>
            <Link
              to="/leaderboard"
              className="grid h-11 flex-1 place-items-center rounded-xl border border-input text-sm font-bold"
            >
              Leaderboard
            </Link>
          </div>
        </div>

        <h2 className="mb-3 text-base font-bold">Solutions</h2>
        <div className="mb-4">
          <ResultBreakdown questions={questions} answers={answers} />
        </div>
        <div className="space-y-3">
          {questions.map((q, i) => (
            <SolutionCard
              key={q.id}
              question={q}
              index={i}
              chosen={answers[q.id]}
              seconds={times[q.id] ?? 0}
            />
          ))}
        </div>
      </AppShell>
    );
  }

  /* ── Live paper ─────────────────────────────────────────────────── */
  const q = questions[index]!;
  const warned = security.warning;

  return (
    <AppShell title={title}>
      <AttemptGuard active kind="test" />
      <ExamRunner
        title={title}
        questions={questions}
        index={index}
        answers={answers}
        marked={marked}
        bookmarks={state.bookmarks}
        timerLabel={formatClock(left)}
        timeLow={left <= 60}
        submitLabel="Submit exam"
        {...(warned && cfg.antiCheat
          ? {
              warning: `${violationLabel(warned.kind)} — violation ${security.seriousCount}/${cfg.maxViolations}${
                warned.penaltySeconds ? `, −${warned.penaltySeconds}s from the clock` : ""
              }.`,
            }
          : {})}
        onIndexChange={setIndex}
        onSelect={(i) => setAnswers((a) => ({ ...a, [q.id]: i }))}
        onToggleMark={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))}
        onToggleBookmark={() => toggleBookmark(q.id)}
        onClear={() =>
          setAnswers((a) => {
            const next = { ...a };
            delete next[q.id];
            return next;
          })
        }
        onSubmit={() => setFinished(true)}
      />

      {/* Lock-screen warning: fullscreen was exited during an exam-lock paper. */}
      <AlertDialog open={cfg.lockScreen && !!warned && !security.fullscreen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive-soft text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <AlertDialogTitle className="text-center">Exam lock broken</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {warned ? violationLabel(warned.kind) : "You left exam mode"}. Violation{" "}
              {security.seriousCount} of {cfg.maxViolations} — the paper auto-submits after that.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                security.dismissWarning();
                void security.enterFullscreen();
              }}
              className="brand-gradient m-0 h-11 w-full rounded-xl border-0 text-sm font-extrabold text-primary-foreground"
            >
              Return to exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-2 py-2">
      <p className="text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
