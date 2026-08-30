/**
 * Anti-cheat exam mode.
 *
 * Watches for the things a student would do to cheat in a live paper — leaving
 * the tab, minimising the app, copying the question, printing, opening dev
 * tools shortcuts, leaving fullscreen — and answers with an escalating
 * penalty: a warning, then clock penalties, then auto-submit.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ViolationKind =
  | "tab-switch"
  | "app-blur"
  | "copy"
  | "paste"
  | "context-menu"
  | "print"
  | "fullscreen-exit"
  | "shortcut";

export type Violation = {
  kind: ViolationKind;
  at: number;
  penaltySeconds: number;
};

const LABELS: Record<ViolationKind, string> = {
  "tab-switch": "You left the exam tab",
  "app-blur": "The exam window lost focus",
  copy: "Copying is disabled during the exam",
  paste: "Pasting is disabled during the exam",
  "context-menu": "Right-click is disabled during the exam",
  print: "Printing / screenshot shortcut blocked",
  "fullscreen-exit": "You exited fullscreen exam mode",
  shortcut: "Blocked shortcut during the exam",
};

export function violationLabel(kind: ViolationKind) {
  return LABELS[kind];
}

export type ExamSecurityOptions = {
  active: boolean;
  /** Number of *serious* violations (leaving the paper) before auto-submit. */
  maxViolations: number;
  /** Seconds removed from the clock per serious violation. */
  penaltySeconds: number;
  /** true → warn the student before they close / reload the exam. */
  lockScreen: boolean;
  onPenalty: (seconds: number) => void;
  onAutoSubmit: () => void;
};

/** Kinds that count towards auto-submit (actually leaving the paper). */
const SERIOUS: ViolationKind[] = ["tab-switch", "app-blur", "fullscreen-exit"];

export function useExamSecurity({
  active,
  maxViolations,
  penaltySeconds,
  lockScreen,
  onPenalty,
  onAutoSubmit,
}: ExamSecurityOptions) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [warning, setWarning] = useState<Violation | null>(null);
  const [penaltyTotal, setPenaltyTotal] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const seriousCount = violations.filter((v) => SERIOUS.includes(v.kind)).length;

  // Latest callbacks without re-registering listeners every render.
  const onPenaltyRef = useRef(onPenalty);
  onPenaltyRef.current = onPenalty;
  const onAutoSubmitRef = useRef(onAutoSubmit);
  onAutoSubmitRef.current = onAutoSubmit;
  const seriousRef = useRef(0);
  seriousRef.current = seriousCount;
  const submittedRef = useRef(false);

  const record = useCallback(
    (kind: ViolationKind) => {
      if (!active || submittedRef.current) return;
      const serious = SERIOUS.includes(kind);
      const penalty = serious ? penaltySeconds : 0;
      const entry: Violation = { kind, at: Date.now(), penaltySeconds: penalty };
      setViolations((list) => [...list, entry]);
      setWarning(entry);
      if (penalty > 0) {
        setPenaltyTotal((n) => n + penalty);
        onPenaltyRef.current(penalty);
      }
      if (serious && maxViolations > 0 && seriousRef.current + 1 >= maxViolations) {
        submittedRef.current = true;
        onAutoSubmitRef.current();
      }
    },
    [active, maxViolations, penaltySeconds],
  );

  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") record("tab-switch");
    };
    const onBlur = () => record("app-blur");
    const block = (kind: ViolationKind) => (e: Event) => {
      e.preventDefault();
      record(kind);
    };
    const onCopy = block("copy");
    const onPaste = block("paste");
    const onContext = block("context-menu");
    const onFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
      if (!isFs) record("fullscreen-exit");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (key === "printscreen") {
        e.preventDefault();
        record("print");
        return;
      }
      if (mod && ["c", "x", "v", "p", "s", "u"].includes(key)) {
        e.preventDefault();
        record(key === "p" || key === "s" ? "print" : key === "v" ? "paste" : "copy");
        return;
      }
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(key))) {
        e.preventDefault();
        record("shortcut");
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!lockScreen) return;
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, lockScreen, record]);

  const enterFullscreen = useCallback(async () => {
    try {
      if (typeof document === "undefined" || document.fullscreenElement) return;
      await document.documentElement.requestFullscreen();
    } catch {
      /* fullscreen refused (iOS Safari) — anti-cheat still works via visibility */
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (typeof document !== "undefined" && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  }, []);

  return {
    violations,
    seriousCount,
    penaltyTotal,
    warning,
    fullscreen,
    dismissWarning: () => setWarning(null),
    enterFullscreen,
    exitFullscreen,
  };
}
