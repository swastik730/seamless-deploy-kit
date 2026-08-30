import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, Database, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/cloud")({
  component: OwnerCloudPage,
});

type Row = { label: string; hint: string; value: string; envName: string };

function useRows(): Row[] {
  const url = import.meta.env["VITE_SUPABASE_URL"] ?? "";
  const projectId = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "";
  const publishable = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";

  return [
    {
      label: "Backend URL",
      hint: "Base URL of the database + auth API.",
      value: url,
      envName: "VITE_SUPABASE_URL",
    },
    {
      label: "Project ID",
      hint: "Unique id of your backend project.",
      value: projectId,
      envName: "VITE_SUPABASE_PROJECT_ID",
    },
    {
      label: "Publishable (anon) key",
      hint: "Safe for the browser — row-level security still applies.",
      value: publishable,
      envName: "VITE_SUPABASE_PUBLISHABLE_KEY",
    },
  ];
}

function CopyRow({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${what} copied`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — long-press the value instead.");
    }
  }

  return (
    <section className="surface space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{row.label}</p>
        <button
          type="button"
          onClick={() => void copy(row.value, row.label)}
          disabled={!row.value}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input px-2.5 text-[11px] font-bold disabled:opacity-50"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{row.hint}</p>
      <p className="select-all break-all rounded-lg bg-muted p-2 font-mono text-[11px] font-semibold">
        {row.value || "not set"}
      </p>
      <button
        type="button"
        onClick={() => void copy(`${row.envName}=${row.value}`, `${row.envName} line`)}
        disabled={!row.value}
        className="text-[11px] font-bold text-primary disabled:opacity-50"
      >
        Copy as {row.envName}=…
      </button>
    </section>
  );
}

function OwnerCloudPage() {
  const rows = useRows();
  const envBlock = rows.map((r) => `${r.envName}=${r.value}`).join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(envBlock);
      toast.success("All backend variables copied");
    } catch {
      toast.error("Could not copy — copy the values one by one.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="surface flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Database className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">Backend connection</p>
          <p className="text-xs text-muted-foreground">
            Owner-only. Paste these into Cloudflare → Variables when you deploy.
          </p>
        </div>
      </section>

      <button
        type="button"
        onClick={() => void copyAll()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-input text-sm font-bold"
      >
        <Copy className="h-4 w-4" /> Copy all deploy variables
      </button>

      {rows.map((r) => (
        <CopyRow key={r.envName} row={r} />
      ))}

      <section className="surface space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ShieldAlert className="h-4 w-4 text-warning" /> Server-only keys
        </p>
        <p className="text-[11px] text-muted-foreground">
          The service-role key and database password are never exposed to the app or this panel — they stay on the
          server, which is what keeps student data safe. Everything the app needs on the server (including the
          service-role key and the built-in AI key) is already wired up automatically.
        </p>
        <p className="text-[11px] text-muted-foreground">
          Razorpay and AI keys live in the private key store — manage them on the <b>Keys</b> and <b>AI</b> tabs.
        </p>
      </section>
    </div>
  );
}
