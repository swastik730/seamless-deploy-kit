import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Clock, Compass, Flame, Sparkles, Target, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHero } from "@/components/PageHero";
import heroProgress from "@/assets/hero-progress.webp";
import { TOTAL_CHAPTERS, getSubject } from "@/lib/curriculum";
import { useQuestionPool } from "@/lib/questions";
import { useAppState } from "@/lib/store";
import { useWeakChapters } from "@/lib/weakChapters";
import {
  buildDailyQueue,
  coverageStats,
  daysUntil,
  saveCoachPlan,
  useCoachPlan,
  useUntouchedChapters,
  type CoachTask,
} from "@/lib/coach";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Revision Coach — Your Daily Study Plan | BoardBuddy" },
      {
        name: "description",
        content:
          "A free personal revision coach that builds a daily study plan from your weak chapters, past mistakes, exam date and available study time.",
      },
      { property: "og:title", content: "Personal Revision Coach | BoardBuddy" },
      {
        property: "og:description",
        content: "Daily revision queue, weak-area drills and mock tests planned around your board exam date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Coach,
});

const MINUTE_OPTIONS = [30, 45, 60, 90, 120];

function TaskLink({ task, children }: { task: CoachTask; children: React.ReactNode }) {
  const className =
    "surface flex items-start gap-4 p-4 transition-transform hover:-translate-y-0.5 active:scale-[0.99] motion-reduce:transform-none";

  if (task.kind === "mock") {
    return (
      <Link to="/tests" className={className}>
        {children}
      </Link>
    );
  }
  if (task.kind === "drill") {
    return (
      <Link to="/exam/run" search={{ mode: "drill", paper: "drill" }} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link
      to="/quiz/$subjectId"
      params={{ subjectId: task.params?.["subjectId"] ?? "mixed" }}
      search={task.search?.["chapter"] ? { chapter: task.search["chapter"] } : {}}
      className={className}
    >
      {children}
    </Link>
  );
}

function Coach() {
  const plan = useCoachPlan();
  const state = useAppState();
  const { pool } = useQuestionPool();
  const weak = useWeakChapters(pool);
  const untouched = useUntouchedChapters(pool);
  const left = daysUntil(plan.examDate);

  const queue = useMemo(
    () => buildDailyQueue(weak, plan.dailyMinutes, left, untouched),
    [weak, plan.dailyMinutes, left, untouched],
  );
  const coverage = coverageStats(weak, TOTAL_CHAPTERS);
  const planMinutes = queue.reduce((n, t) => n + t.minutes, 0);

  return (
    <AppShell title="Revision Coach">
      <PageHero
        eyebrow="Free for everyone"
        eyebrowIcon={<Sparkles className="h-3.5 w-3.5" />}
        title="Your personal"
        titleAccent="revision coach"
        description="Today's plan is built from your weak chapters, the questions you got wrong, your exam date and the time you actually have."
        image={heroProgress}
        imageAlt="Student planning a study timetable"
        tint="green"
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" /> Days to exam
          </p>
          <p className="mt-1 text-2xl font-extrabold">{left === null ? "—" : Math.max(0, left)}</p>
        </div>
        <div className="surface p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" /> Today&apos;s plan
          </p>
          <p className="mt-1 text-2xl font-extrabold">{planMinutes} min</p>
        </div>
        <div className="surface p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <TrendingUp className="h-4 w-4 shrink-0" /> Chapters practised
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {coverage.covered}
            <span className="text-base font-bold text-muted-foreground">/{TOTAL_CHAPTERS}</span>
          </p>
        </div>
      </section>

      <section className="surface mb-6 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Compass className="h-4 w-4" />
          </span>
          Set up your plan
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Board exam start date</span>
            <input
              type="date"
              value={plan.examDate ?? ""}
              onChange={(e) => saveCoachPlan({ examDate: e.target.value || null })}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Study time per day</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {MINUTE_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => saveCoachPlan({ dailyMinutes: m })}
                  aria-pressed={plan.dailyMinutes === m}
                  className={
                    plan.dailyMinutes === m
                      ? "rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"
                      : "rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  }
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        </div>
        {left !== null && left >= 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {left === 0
              ? "Your exam starts today — revise formulas and stay calm."
              : `About ${Math.max(1, Math.round((left * plan.dailyMinutes) / 60))} study hours left before your first paper.`}
          </p>
        ) : null}
      </section>

      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-hero-green/15 text-hero-green">
          <Target className="h-4 w-4" />
        </span>
        Today&apos;s revision queue
      </h2>
      <ol className="space-y-3">
        {queue.map((task, i) => (
          <li key={task.id}>
            <TaskLink task={task}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-extrabold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{task.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{task.detail}</span>
              </span>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                {task.minutes} min
              </span>
            </TaskLink>
          </li>
        ))}
      </ol>

      {weak.length > 0 ? (
        <>
          <h2 className="mb-3 mt-6 flex items-center gap-2 text-base font-bold">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-hero-amber/20 text-hero-amber">
              <Flame className="h-4 w-4" />
            </span>
            Weak areas the coach is tracking
          </h2>
          <ul className="space-y-2">
            {weak.slice(0, 6).map((w) => (
              <li key={w.chapterId} className="surface flex items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{w.chapterName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {getSubject(w.subjectId)?.name ?? w.subjectName} · {w.wrong} wrong of {w.answered}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-hero-amber">{w.accuracy}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Attempt a quiz or a mock test and your weak areas will appear here automatically.
        </p>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Your plan is saved on this device. Signed in with {state.name}? Your attempts sync to your account too.
      </p>
    </AppShell>
  );
}
