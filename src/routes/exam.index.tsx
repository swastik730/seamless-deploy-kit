import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Activity,
  ChevronRight,
  ClipboardList,
  Flame,
  Loader2,
  ShieldCheck,
  Target,
  Timer,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { PageHero } from "@/components/PageHero";
import { EXAM_MODES, formatClock, type ExamMode } from "@/lib/examModes";
import { buildGrandTests, buildSimulators } from "@/lib/grandTest";
import { useQuestionPool } from "@/lib/questions";
import { useAppState } from "@/lib/store";
import { useWeakChapters, useWeakTrend } from "@/lib/weakChapters";

import heroTests from "@/assets/hero-tests.webp";

export const Route = createFileRoute("/exam/")({
  head: () => ({
    meta: [
      { title: "Grand Test, Exam Simulator & Weak-Chapter Drill | BoardBuddy" },
      {
        name: "description",
        content:
          "Attempt ranked full-syllabus Grand Tests, a 3-hour exam day simulator and adaptive drills built from your own mistakes — with percentile, rank and PDF reports.",
      },
      { property: "og:title", content: "Exam Hub — ranked tests & adaptive drills | BoardBuddy" },
      {
        property: "og:description",
        content:
          "Grand Test, 3-hour Exam Day Simulator and adaptive Weak-Chapter Drill with rank, percentile and downloadable PDF reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExamHub,
});

const MODE_TINT: Record<ExamMode, string> = {
  grand: "bg-primary-soft text-primary",
  simulator: "bg-reward-soft text-hero-purple",
  drill: "bg-success-soft text-success",
};

function ExamHub() {
  const { pool, loading } = useQuestionPool();
  const state = useAppState();
  const weak = useWeakChapters(pool);
  const trend = useWeakTrend(6);

  const grands = useMemo(() => (loading ? [] : buildGrandTests(pool)), [pool, loading]);
  const sims = useMemo(() => (loading ? [] : buildSimulators(pool)), [pool, loading]);

  const examAttempts = useMemo(
    () => state.attempts.filter((a) => a.mode === "grand" || a.mode === "simulator" || a.mode === "drill"),
    [state.attempts],
  );

  const bestByPaper = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of examAttempts) {
      if (!a.testId) continue;
      const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
      map.set(a.testId, Math.max(map.get(a.testId) ?? 0, pct));
    }
    return map;
  }, [examAttempts]);

  return (
    <AppShell title="Exam Hub">
      <PageHero
        eyebrow="High stakes"
        eyebrowIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        title="Exam Hub"
        titleAccent="rank, percentile & drills"
        description="Ranked Grand Tests, a full 3-hour simulator and drills built from your own mistakes."
        image={heroTests}
        imageAlt="Exam clipboard with stopwatch"
        tint="purple"
      />

      {/* ── Mode summary cards ─────────────────────────────────────── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {(["grand", "simulator", "drill"] as ExamMode[]).map((id) => {
          const cfg = EXAM_MODES[id];
          return (
            <div key={id} className="surface p-4">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${MODE_TINT[id]}`}>
                {id === "grand" ? (
                  <Trophy className="h-4 w-4" />
                ) : id === "simulator" ? (
                  <Timer className="h-4 w-4" />
                ) : (
                  <Target className="h-4 w-4" />
                )}
              </span>
              <p className="mt-2 text-sm font-extrabold">{cfg.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{cfg.tagline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>{cfg.questions} Q</Chip>
                <Chip>{cfg.minutes} min</Chip>
                <Chip>−{cfg.negative} wrong</Chip>
                {cfg.ranked ? <Chip>Ranked</Chip> : <Chip>Adaptive</Chip>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Grand Tests ────────────────────────────────────────────── */}
      <SectionTitle icon={<Trophy className="h-4 w-4 text-hero-amber" />} title="Grand Tests">
        Same paper for every student, so rank and percentile actually mean something.
      </SectionTitle>
      <div className="mb-6 space-y-3">
        {loading ? (
          <Loading label="Building Grand Tests…" />
        ) : grands.length === 0 ? (
          <Empty>
            A Grand Test needs at least {EXAM_MODES.grand.questions} published questions in the bank.
          </Empty>
        ) : (
          grands.map((paper) => (
            <PaperRow
              key={paper.id}
              mode="grand"
              id={paper.id}
              title={paper.title}
              subtitle={paper.subtitle}
              questions={paper.questionIds.length}
              minutes={paper.minutes}
              best={bestByPaper.get(paper.id)}
            />
          ))
        )}
      </div>

      {/* ── Simulators ─────────────────────────────────────────────── */}
      <SectionTitle icon={<Timer className="h-4 w-4 text-hero-purple" />} title="Exam Day Simulator">
        Full {formatClock(EXAM_MODES.simulator.minutes * 60)} paper, no pause, no exit — the real thing.
      </SectionTitle>
      <div className="mb-6 space-y-3">
        {loading ? (
          <Loading label="Building simulators…" />
        ) : sims.length === 0 ? (
          <Empty>Add more questions to the bank to unlock the 3-hour simulator.</Empty>
        ) : (
          sims.map((paper) => (
            <PaperRow
              key={paper.id}
              mode="simulator"
              id={paper.id}
              title={paper.title}
              subtitle={paper.subtitle}
              questions={paper.questionIds.length}
              minutes={paper.minutes}
              best={bestByPaper.get(paper.id)}
            />
          ))
        )}
      </div>

      {/* ── Weak-chapter drill ─────────────────────────────────────── */}
      <SectionTitle icon={<Target className="h-4 w-4 text-success" />} title="Weak-Chapter Drill">
        Half the paper is rebuilt from questions you actually got wrong.
      </SectionTitle>
      <div className="surface mb-6 p-4">
        {weak.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Attempt a Grand Test or a couple of chapter quizzes first — we need a few answers before we
            can find your weak chapters.
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {weak.slice(0, 5).map((w) => (
              <li key={w.chapterId} className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-destructive-soft text-destructive">
                  <Flame className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{w.chapterName}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {w.subjectName} · {w.accuracy}% accuracy over {w.answered} questions
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {w.wrong} wrong
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/exam/run"
          search={{ mode: "drill", paper: "" }}
          className="brand-gradient grid h-12 w-full place-items-center rounded-xl text-sm font-extrabold text-primary-foreground"
        >
          Start {EXAM_MODES.drill.questions}-question drill
        </Link>
      </div>

      {/* ── Weak-topic trend ───────────────────────────────────────── */}
      <SectionTitle icon={<Activity className="h-4 w-4 text-primary" />} title="Accuracy trend">
        Your answered-question accuracy over the last 6 weeks.
      </SectionTitle>
      <div className="surface mb-6 p-4">
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="examTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-card)",
                  fontSize: 12,
                }}
                formatter={(value: number | string) => [`${value}%`, "Accuracy"]}
              />
              <Area
                type="monotone"
                dataKey="accuracy"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                fill="url(#examTrend)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Past exam attempts ─────────────────────────────────────── */}
      <SectionTitle icon={<ClipboardList className="h-4 w-4 text-primary" />} title="Past exam attempts">
        Your last ranked and drill attempts.
      </SectionTitle>
      <div className="surface divide-y divide-border/70 overflow-hidden p-0">
        {examAttempts.length === 0 ? (
          <p className="p-5 text-center text-xs text-muted-foreground">
            No exam attempts yet — start with a Grand Test above.
          </p>
        ) : (
          examAttempts.slice(0, 10).map((a) => {
            const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{a.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(a.date).toLocaleString()} · {a.correct}/{a.total} correct ·{" "}
                    {formatClock(a.seconds)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold tabular-nums text-primary">{pct}%</span>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
      {children}
    </span>
  );
}

function SectionTitle({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-base font-bold">
        {icon} {title}
      </h2>
      {children ? <p className="mt-1 text-xs text-muted-foreground">{children}</p> : null}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <p className="surface flex items-center justify-center gap-2 p-5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="surface p-5 text-center text-xs text-muted-foreground">{children}</p>;
}

function PaperRow({
  mode,
  id,
  title,
  subtitle,
  questions,
  minutes,
  best,
}: {
  mode: ExamMode;
  id: string;
  title: string;
  subtitle: string;
  questions: number;
  minutes: number;
  best?: number | undefined;
}) {
  return (
    <Link
      to="/exam/run"
      search={{ mode, paper: id }}
      className="surface flex items-center gap-3 p-4 transition-transform active:scale-[0.99]"
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${MODE_TINT[mode]}`}>
        {mode === "simulator" ? <Timer className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <Chip>{questions} Q</Chip>
          <Chip>{minutes} min</Chip>
          {typeof best === "number" ? <Chip>Best {best}%</Chip> : null}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
