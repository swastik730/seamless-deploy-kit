import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, CloudUpload, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BrandMark } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import {
  RECOVERY_QUESTIONS,
  hashAnswer,
  identifierToEmail,
  normalizeUsername,
  passwordError,
  usernameError,
} from "@/lib/username";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



/** Only same-origin relative paths are accepted as a post-login destination. */
function safeRedirect(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const raw = search["redirect"];
    return typeof raw === "string" ? { redirect: safeRedirect(raw) } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in to BoardBuddy | Sync your Class 10 progress" },
      {
        name: "description",
        content:
          "Create a BoardBuddy account with just a username and password to sync XP, streak, quiz attempts and bookmarks across devices.",
      },
      { property: "og:title", content: "Sign in to BoardBuddy" },
      {
        property: "og:description",
        content: "Save your Class 10 board preparation progress and study from any device.",
      },
    ],
  }),
  component: AuthPage,
});

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] font-semibold text-destructive">{children}</p>;
}

/**
 * Username-only accounts use a synthetic email that can never receive a
 * confirmation mail. If the backend still has "Confirm email" switched on,
 * this repairs the account so the user can sign in immediately.
 */
async function confirmSignupEmail(username: string): Promise<void> {
  try {
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    await rpc("confirm_signup_email", { _username: username });
  } catch {
    /* best effort — the sign-in retry surfaces any remaining problem */
  }
}

function friendlyAuthError(message: string): string {
  if (/confirm/i.test(message)) {
    return "Your account was created, but the server still asks for email confirmation. Please ask the app owner to turn off 'Confirm email' in Supabase → Authentication → Sign In/Providers → Email.";
  }
  if (/invalid/i.test(message)) return "Username or password is incorrect.";
  return message;
}


const inputClass =
  "h-12 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary";

const inputErrorClass =
  "h-12 w-full rounded-xl border border-destructive bg-background px-3 text-sm outline-none";

/** true = free, false = taken, null = check unavailable (offline etc.). */
async function checkUsernameFree(id: string): Promise<boolean | null> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null; error: unknown }>;
  const { data, error } = await rpc("username_available", { _username: id });
  if (error || typeof data !== "boolean") return null;
  return data;
}


function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { user, ready } = useSession();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [question, setQuestion] = useState(RECOVERY_QUESTIONS[0] as string);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "free" | "taken">("idle");

  const target = safeRedirect(redirect);

  useEffect(() => {
    if (ready && user) void navigate({ to: target, replace: true });
  }, [ready, user, target, navigate]);

  // Live "is this username free?" check while signing up (debounced).
  useEffect(() => {
    if (mode !== "signup") return setNameStatus("idle");
    const id = normalizeUsername(username);
    if (usernameError(id)) return setNameStatus("idle");
    setNameStatus("checking");
    let active = true;
    const timer = setTimeout(() => {
      void checkUsernameFree(id).then((free) => {
        if (active) setNameStatus(free === null ? "idle" : free ? "free" : "taken");
      });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, mode]);

  function switchMode(next: "signin" | "signup" | "forgot") {
    setMode(next);
    setError(null);
    setInfo(null);
    setFieldErrors({});
  }

  /** Validates the fields visible in the current mode; returns true when clean. */
  function validate(id: string): boolean {
    const next: Record<string, string> = {};

    if (mode === "signin") {
      if (!id) next["username"] = "Please enter your username.";
      if (!password) next["password"] = "Please enter your password.";
    } else {
      const uErr = usernameError(id);
      if (uErr) next["username"] = uErr;
      else if (mode === "signup" && nameStatus === "taken") {
        next["username"] = "This username is already taken — please try another one.";
      }
      const pErr = passwordError(password, id);
      if (pErr) next["password"] = mode === "forgot" ? `New password: ${pErr.charAt(0).toLowerCase()}${pErr.slice(1)}` : pErr;
      if (!answer.trim()) {
        next["answer"] =
          mode === "signup"
            ? "Please enter a secret answer — you will need it if you ever forget your password."
            : "Please enter your secret answer.";
      }
      if (mode === "signup" && name.trim() && name.trim().length < 2) {
        next["name"] = "Your name must be at least 2 characters long.";
      }
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const id = username.trim();
    if (!validate(id)) return;

    setBusy(true);
    try {
      if (mode === "forgot") {
        const rpc = supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
        const { data, error: err } = await rpc("reset_password_with_answer", {
          _username: normalizeUsername(id),
          _answer_hash: await hashAnswer(id, answer),
          _new_password: password,
        });
        if (err) return setError(err.message);
        if (!data) return setError("Username or secret answer is incorrect (the owner account cannot be reset).");
        setInfo("Password changed! Sign in with your new password now.");
        setAnswer("");
        setPassword("");
        setMode("signin");
        return;
      }

      if (mode === "signup") {
        const free = await checkUsernameFree(normalizeUsername(id));
        if (free === false) {
          setNameStatus("taken");
          setFieldErrors({ username: "This username is already taken — please try another one." });
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: identifierToEmail(id),
          password,

          options: {
            data: {
              name: name.trim() || normalizeUsername(id),
              username: normalizeUsername(id),
              recovery_question: question,
              recovery_answer_hash: await hashAnswer(id, answer),
            },
          },
        });
        if (err) {
          return setError(
            /already|exists|duplicate/i.test(err.message)
              ? "This username is already taken — please try another one."
              : err.message,
          );
        }
        if (!data.session) {
          let signInErr = (
            await supabase.auth.signInWithPassword({
              email: identifierToEmail(id),
              password,
            })
          ).error;
          // Username-only accounts use a synthetic email that can never receive a
          // confirmation mail. If the project still has "Confirm email" on, repair
          // the account server-side and retry once.
          if (signInErr && /confirm/i.test(signInErr.message)) {
            await confirmSignupEmail(normalizeUsername(id));
            signInErr = (
              await supabase.auth.signInWithPassword({
                email: identifierToEmail(id),
                password,
              })
            ).error;
          }
          if (signInErr) return setError(friendlyAuthError(signInErr.message));
        }
        void navigate({ to: target, replace: true });
        return;
      }

      let signIn = await supabase.auth.signInWithPassword({
        email: identifierToEmail(id),
        password,
      });
      if (signIn.error && /confirm/i.test(signIn.error.message)) {
        await confirmSignupEmail(normalizeUsername(id));
        signIn = await supabase.auth.signInWithPassword({
          email: identifierToEmail(id),
          password,
        });
      }
      if (signIn.error) return setError(friendlyAuthError(signIn.error.message));
      if (signIn.data.session) void navigate({ to: target, replace: true });

    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      {/* Brand panel — desktop and Smart TV only */}
      <aside className="hidden lg:flex lg:flex-col lg:justify-center lg:gap-8 lg:bg-primary-soft lg:px-14 lg:py-16 xl:px-20 2xl:px-28">
        <Link to="/" className="inline-block">
          <BrandMark />
        </Link>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
            Prepare for your Class 10 boards with a plan that adapts to you.
          </h2>
          <p className="mt-4 max-w-xl text-base text-muted-foreground xl:text-lg">
            Chapter-wise lessons, NCERT solutions, timed mock tests and honest progress tracking —
            all in one place, on every device you study from.
          </p>
        </div>
        <ul className="grid max-w-xl gap-3 xl:text-base">
          {[
            "Learn every subject chapter by chapter",
            "Practise with real board-pattern questions",
            "Track weak chapters and improve them first",
            "Your progress syncs safely to the cloud",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 text-sm font-semibold xl:text-base">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              {line}
            </li>
          ))}
        </ul>
      </aside>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 lg:max-w-lg lg:px-10 xl:max-w-xl">
      <div className="mb-6 text-center lg:text-left">
        <Link to="/" className="inline-block lg:hidden">
          <BrandMark className="justify-center" />
        </Link>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight lg:mt-0 lg:text-3xl xl:text-4xl">
          {mode === "signin"
            ? "Welcome back"
            : mode === "signup"
              ? "Create your account"
              : "Reset your password"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground lg:text-base">
          {mode === "forgot"
            ? "Set a new password using your username and secret answer."
            : "Just a username and password — no email needed."}
        </p>
      </div>

      <div className="surface p-5 lg:p-7">

        <form onSubmit={submit} noValidate className="space-y-3">
          {mode === "signup" && (
            <div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (display name)"
                autoComplete="name"
                className={fieldErrors["name"] ? inputErrorClass : inputClass}
              />
              {fieldErrors["name"] && <FieldError>{fieldErrors["name"]}</FieldError>}
            </div>
          )}

          <div>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setFieldErrors((prev) => ({ ...prev, username: "" }));
              }}
              onBlur={() => {
                if (mode === "signin" || !username.trim()) return;
                const uErr = usernameError(username);
                if (uErr) setFieldErrors((prev) => ({ ...prev, username: uErr }));
              }}
              placeholder="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Username"
              className={fieldErrors["username"] ? inputErrorClass : inputClass}
            />
            {fieldErrors["username"] ? (
              <FieldError>{fieldErrors["username"]}</FieldError>
            ) : mode === "signup" && nameStatus === "checking" ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking username…
              </p>
            ) : mode === "signup" && nameStatus === "free" ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-success">
                <CheckCircle2 className="h-3 w-3" /> This username is available
              </p>
            ) : mode === "signup" && nameStatus === "taken" ? (
              <FieldError>This username is already taken — please try another one.</FieldError>
            ) : mode === "signup" ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                3–20 characters — letters, numbers, dots and underscores
              </p>
            ) : null}
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: "" }));
              }}
              onBlur={() => {
                if (mode === "signin" || !password) return;
                const pErr = passwordError(password, username);
                if (pErr) setFieldErrors((prev) => ({ ...prev, password: pErr }));
              }}
              placeholder={mode === "forgot" ? "New password (at least 6 characters)" : "Password (min 6 characters)"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className={fieldErrors["password"] ? inputErrorClass : inputClass}
            />
            {fieldErrors["password"] && <FieldError>{fieldErrors["password"]}</FieldError>}
          </div>

          {mode === "signup" && (
            <>
              <Select value={question} onValueChange={setQuestion}>
                <SelectTrigger className={inputClass} aria-label="Secret question">
                  <SelectValue placeholder="Choose a secret question" />
                </SelectTrigger>
                <SelectContent className="z-[60] max-h-72">
                  {RECOVERY_QUESTIONS.map((q) => (
                    <SelectItem key={q} value={q}>
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div>
                <input
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, answer: "" }));
                  }}
                  placeholder="Secret answer (remember this)"
                  className={fieldErrors["answer"] ? inputErrorClass : inputClass}
                />
                {fieldErrors["answer"] && <FieldError>{fieldErrors["answer"]}</FieldError>}
              </div>
            </>
          )}

          {mode === "forgot" && (
            <div>
              <input
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, answer: "" }));
                }}
                placeholder="Secret answer"
                className={fieldErrors["answer"] ? inputErrorClass : inputClass}
              />
              {fieldErrors["answer"] && <FieldError>{fieldErrors["answer"]}</FieldError>}
            </div>
          )}


          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="w-full text-right text-xs font-semibold text-primary"
            >
              Forgot password?
            </button>
          )}

          {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
          {info && (
            <p className="flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2 text-xs font-semibold text-success">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="brand-gradient flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Set new password"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          className="mt-4 w-full text-center text-xs font-semibold text-primary"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </div>

      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <CloudUpload className="h-3.5 w-3.5" />
        You can study without an account — your progress stays saved on this device.
      </p>
      <Link to="/" className="mt-3 text-center text-xs font-semibold text-primary">
        Continue without an account
      </Link>
      </div>
    </div>

  );
}
