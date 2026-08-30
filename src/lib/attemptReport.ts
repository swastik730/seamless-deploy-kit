/**
 * Downloadable PDF attempt reports.
 *
 * Every attempt (Grand Test, Simulator, Drill or a normal mock test) can be
 * exported as a one-file PDF with the score breakdown, exact negative-marking
 * maths, subject/chapter performance and the recommended next practice.
 */
import type { Question } from "./curriculum";
import { SUBJECTS, getSubject } from "./curriculum";
import { EXAM_MODES, examMarks, examPercent, type ExamMode } from "./examModes";
import type { Attempt } from "./store";
import { computeWeakChapters, nextPracticeAdvice, type WeakChapter } from "./weakChapters";

export type ReportRow = {
  name: string;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
};

export type AttemptReport = {
  studentName: string;
  title: string;
  modeLabel: string;
  date: string;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  positive: number;
  negative: number;
  marks: number;
  maxMarks: number;
  percent: number;
  seconds: number;
  accuracy: number;
  rank?: { rank: number; total: number; percentile: number; source: string } | undefined;
  violations?: number | undefined;
  subjects: ReportRow[];
  chapters: ReportRow[];
  advice: string[];
};

function emptyRow(name: string): ReportRow {
  return { name, total: 0, correct: 0, wrong: 0, skipped: 0, accuracy: 0 };
}

function finishRows(map: Map<string, ReportRow>): ReportRow[] {
  return [...map.values()]
    .map((r) => ({
      ...r,
      accuracy: r.correct + r.wrong ? Math.round((r.correct / (r.correct + r.wrong)) * 100) : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

const MODE_LABEL: Record<string, string> = {
  grand: "Grand Test (ranked, negative marking)",
  simulator: "Exam Day Simulator (3 hours, no pause)",
  drill: "Adaptive Weak-Chapter Drill",
  test: "Mock Test",
  quiz: "Chapter Quiz",
  challenge: "Challenge",
};

/** Builds a report from a stored attempt plus the question bank. */
export function buildAttemptReport(
  attempt: Attempt,
  pool: Question[],
  opts: {
    studentName: string;
    allAttempts: Attempt[];
    rank?: AttemptReport["rank"];
    violations?: number | undefined;
  },
): AttemptReport {
  const byId = new Map(pool.map((q) => [q.id, q]));
  const cfg = EXAM_MODES[(attempt.mode as ExamMode) in EXAM_MODES ? (attempt.mode as ExamMode) : "grand"];

  const subjects = new Map<string, ReportRow>();
  const chapters = new Map<string, ReportRow>();

  for (const item of attempt.perQuestion) {
    const q = byId.get(item.questionId);
    const subjectName = getSubject(q?.subjectId ?? attempt.subjectId)?.name ?? "Mixed";
    const chapterName =
      SUBJECTS.flatMap((s) => s.chapters).find((c) => c.id === (q?.chapterId ?? attempt.chapterId))
        ?.name ?? "Mixed chapters";

    for (const [key, map, name] of [
      [subjectName, subjects, subjectName],
      [chapterName, chapters, chapterName],
    ] as const) {
      const row = map.get(key) ?? emptyRow(name);
      row.total += 1;
      if (item.answered === false) row.skipped += 1;
      else if (item.correct) row.correct += 1;
      else row.wrong += 1;
      map.set(key, row);
    }
  }

  const skipped = attempt.unanswered;
  const correct = attempt.correct;
  const wrong = Math.max(0, attempt.total - correct - skipped);
  const weak: WeakChapter[] = computeWeakChapters(opts.allAttempts, pool);

  return {
    studentName: opts.studentName,
    title: attempt.label,
    modeLabel: MODE_LABEL[attempt.mode] ?? "Practice",
    date: attempt.date,
    total: attempt.total,
    correct,
    wrong,
    skipped,
    positive: cfg.positive,
    negative: cfg.negative,
    marks: examMarks(cfg, correct, wrong),
    maxMarks: attempt.total * cfg.positive,
    percent: examPercent(cfg, correct, wrong, attempt.total),
    seconds: attempt.seconds,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0,
    rank: opts.rank,
    violations: opts.violations,
    subjects: finishRows(subjects),
    chapters: finishRows(chapters).slice(0, 12),
    advice: nextPracticeAdvice(weak),
  };
}

function hms(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

/** Renders the report to a PDF and triggers a download. */
export async function downloadAttemptPdf(report: AttemptReport) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  let y = 0;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed < pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  // Header band
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("BoardBuddy — Attempt Report", margin, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${report.title}  ·  ${report.modeLabel}`, margin, 64);
  doc.text(
    `${report.studentName}  ·  ${new Date(report.date).toLocaleString()}`,
    margin,
    80,
  );
  y = 130;

  const heading = (text: string) => {
    newPageIfNeeded(40);
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(text, margin, y);
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 16;
  };

  const line = (label: string, value: string, bold = false) => {
    newPageIfNeeded(20);
    doc.setFontSize(10.5);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text(label, margin, y);
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(value, pageW - margin, y, { align: "right" });
    y += 18;
  };

  heading("Score summary");
  line("Final score", `${report.marks.toFixed(2)} / ${report.maxMarks} marks`, true);
  line("Percentage (after negative marking)", `${report.percent}%`, true);
  if (report.rank) {
    line("Rank", `#${report.rank.rank} of ${report.rank.total}`);
    line(
      "Percentile",
      `${report.rank.percentile}${report.rank.source === "estimated" ? " (estimated)" : ""}`,
    );
  }
  line("Accuracy on attempted", `${report.accuracy}%`);
  line("Time taken", hms(report.seconds));
  if (typeof report.violations === "number") {
    line("Anti-cheat violations", String(report.violations));
  }
  y += 6;

  heading("Negative marking breakdown");
  line("Questions in paper", String(report.total));
  line("Correct", `${report.correct}  ×  +${report.positive}  =  +${(report.correct * report.positive).toFixed(2)}`);
  line("Incorrect", `${report.wrong}  ×  -${report.negative}  =  -${(report.wrong * report.negative).toFixed(2)}`);
  line("Unattempted", `${report.skipped}  ×  0  =  0.00`);
  line(
    "Net marks",
    `${(report.correct * report.positive).toFixed(2)} - ${(report.wrong * report.negative).toFixed(2)} = ${report.marks.toFixed(2)}`,
    true,
  );
  y += 6;

  const table = (title: string, rows: ReportRow[]) => {
    if (rows.length === 0) return;
    heading(title);
    newPageIfNeeded(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Topic", margin, y);
    doc.text("Q", pageW - margin - 190, y, { align: "right" });
    doc.text("Correct", pageW - margin - 130, y, { align: "right" });
    doc.text("Wrong", pageW - margin - 65, y, { align: "right" });
    doc.text("Accuracy", pageW - margin, y, { align: "right" });
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(17, 24, 39);
    for (const r of rows) {
      newPageIfNeeded(18);
      const name = doc.splitTextToSize(r.name, pageW - margin * 2 - 210)[0] ?? r.name;
      doc.text(String(name), margin, y);
      doc.text(String(r.total), pageW - margin - 190, y, { align: "right" });
      doc.text(String(r.correct), pageW - margin - 130, y, { align: "right" });
      doc.text(String(r.wrong), pageW - margin - 65, y, { align: "right" });
      doc.text(`${r.accuracy}%`, pageW - margin, y, { align: "right" });
      y += 16;
    }
    y += 6;
  };

  table("Subject-wise performance", report.subjects);
  table("Chapter-wise performance (weakest first)", report.chapters);

  heading("Recommended next practice");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  for (const item of report.advice) {
    const lines = doc.splitTextToSize(`•  ${item}`, pageW - margin * 2);
    newPageIfNeeded(lines.length * 14 + 6);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 6;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`BoardBuddy · page ${i} of ${pages}`, pageW / 2, pageH - 24, { align: "center" });
  }

  const safe = report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`boardbuddy-${safe}-${new Date(report.date).toISOString().slice(0, 10)}.pdf`);
}
