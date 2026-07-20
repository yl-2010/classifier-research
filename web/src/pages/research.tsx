import Head from "next/head";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { ClusteredMetricsChart, type ArmMetrics } from "@/components/ClusteredMetricsChart";
import { SiteFooter } from "@/components/SiteFooter";
import { useNotelmsRuntimeConfig } from "@/lib/notelmsApi";

const JUMP_KEY = "notelms-jump";
const INCLUDE_USER_KEY = "notelms-research-include-user";
const INCLUDE_EVAL_KEY = "notelms-research-include-eval";

type EvalPayload = {
  subjects?: string[];
  test_n?: number;
  updated_at?: string;
  include_user_tests?: boolean;
  include_frozen_tests?: boolean;
  user_test_n?: number;
  frozen_test_n?: number;
  source?: string;
  arms?: Record<string, ArmMetrics & { per_class?: Record<string, unknown> }>;
};

const ARM_ORDER = ["zero_shot", "fine_tuned", "gpt_oss"] as const;

function pct(v: number | undefined) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function dayOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** e.g. "June 5th 2010, 10:02:09 am pacific" */
function formatUpdatedStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const day = Number(parts.day);
  const period = (parts.dayPeriod || "am").toLowerCase();
  return `${parts.month} ${dayOrdinal(day)} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${period} pacific`;
}

function readIncludeUserPref(): boolean {
  try {
    return sessionStorage.getItem(INCLUDE_USER_KEY) === "1";
  } catch {
    return false;
  }
}

function readIncludeEvalPref(): boolean {
  try {
    const raw = sessionStorage.getItem(INCLUDE_EVAL_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

function writePref(key: string, on: boolean) {
  try {
    sessionStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function ResearchPage() {
  const { status } = useSession();
  const router = useRouter();
  const signedIn = status === "authenticated";
  const { apiBase, loading: configLoading } = useNotelmsRuntimeConfig();
  const [includeUserTests, setIncludeUserTests] = useState(false);
  const [includeEvalTests, setIncludeEvalTests] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [data, setData] = useState<EvalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let user = readIncludeUserPref();
    let evalOn = readIncludeEvalPref();
    if (!user && !evalOn) {
      evalOn = true;
      writePref(INCLUDE_EVAL_KEY, true);
    }
    setIncludeUserTests(user);
    setIncludeEvalTests(evalOn);
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    if (configLoading) return;

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!apiBase) {
          if (!includeEvalTests) {
            throw new Error("API not configured");
          }
          const res = await fetch("/research-metrics.json", { cache: "no-store" });
          if (!res.ok) throw new Error(`Failed to load metrics (${res.status})`);
          const json = (await res.json()) as EvalPayload;
          if (!cancelled) {
            setData({
              ...json,
              include_user_tests: false,
              include_frozen_tests: true,
              user_test_n: json.user_test_n ?? 0,
            });
          }
          return;
        }

        const params = new URLSearchParams();
        if (includeUserTests) params.set("includeUser", "1");
        params.set("includeFrozen", includeEvalTests ? "1" : "0");
        const url = `${apiBase.replace(/\/$/, "")}/api/research/metrics?${params}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error || `Failed to load metrics (${res.status})`,
          );
        }
        const json = (await res.json()) as EvalPayload & { ok?: boolean };
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(
            err instanceof Error ? err.message : "Failed to load research metrics",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    prefsReady,
    includeUserTests,
    includeEvalTests,
    apiBase,
    configLoading,
  ]);

  const onToggleUserTests = (next: boolean) => {
    if (!next && !includeEvalTests) {
      setIncludeUserTests(false);
      setIncludeEvalTests(true);
      writePref(INCLUDE_USER_KEY, false);
      writePref(INCLUDE_EVAL_KEY, true);
      return;
    }
    setIncludeUserTests(next);
    writePref(INCLUDE_USER_KEY, next);
  };

  const onToggleEvalTests = (next: boolean) => {
    if (!next && !includeUserTests) {
      setIncludeEvalTests(false);
      setIncludeUserTests(true);
      writePref(INCLUDE_EVAL_KEY, false);
      writePref(INCLUDE_USER_KEY, true);
      return;
    }
    setIncludeEvalTests(next);
    writePref(INCLUDE_EVAL_KEY, next);
  };

  const arms = useMemo(() => {
    if (!data?.arms) return [] as ArmMetrics[];
    return ARM_ORDER.filter((k) => data.arms?.[k]).map((k) => {
      const a = data.arms![k];
      return {
        name: a.name || k,
        label:
          a.label ||
          ({
            zero_shot: "Zero-shot BERT",
            fine_tuned: "Fine-tuned BERT",
            gpt_oss: "GPT-OSS 20B",
          }[k] as string),
        accuracy: a.accuracy,
        micro_f1: a.micro_f1 ?? a.accuracy,
        macro_f1: a.macro_f1,
        n: a.n,
      };
    });
  }, [data]);

  const jumpHome = () => {
    sessionStorage.setItem(JUMP_KEY, "notebook");
    void router.push("/");
  };

  const userTestCount =
    typeof data?.user_test_n === "number" ? data.user_test_n : null;
  const userToggleLabel =
    userTestCount === null
      ? "Include user tests"
      : `Include ${userTestCount} user tests`;

  const toggleHint = (() => {
    if (includeUserTests && includeEvalTests) {
      return "Charts pool the original eval set with live classifications from every user.";
    }
    if (includeUserTests) {
      return "Charts show only live classifications from every user.";
    }
    return "Charts show only the original offline eval run.";
  })();

  return (
    <>
      <Head>
        <title>Research - NoteLMs</title>
      </Head>
      <div className="app">
        <AppNav
          active="research"
          onNotebook={signedIn ? jumpHome : undefined}
        />

        <header className="hero">
          <h1>Research</h1>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeUserTests}
                onChange={(e) => onToggleUserTests(e.target.checked)}
              />
              <span className="toggle-ui" aria-hidden="true" />
              <span className="toggle-label">{userToggleLabel}</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeEvalTests}
                onChange={(e) => onToggleEvalTests(e.target.checked)}
              />
              <span className="toggle-ui" aria-hidden="true" />
              <span className="toggle-label">Include original eval tests</span>
            </label>
            <p className="toggle-hint">{toggleHint}</p>
          </div>
        </header>

        {error ? <p className="error">{error}</p> : null}
        {loading && !error ? <p className="muted">Loading metrics…</p> : null}

        {!loading && arms.length > 0 ? (
          <section className="panel" aria-labelledby="headline-metrics">
            <h2 id="headline-metrics">Classifier comparison</h2>
            <ClusteredMetricsChart arms={arms} order={[...ARM_ORDER]} />

            <div className="table-scroll">
              <table className="metrics">
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Accuracy</th>
                    <th>Micro-F1</th>
                    <th>Macro-F1</th>
                  </tr>
                </thead>
                <tbody>
                  {arms.map((a) => (
                    <tr key={a.name}>
                      <td>{a.label}</td>
                      <td>{pct(a.accuracy)}</td>
                      <td>{pct(a.micro_f1)}</td>
                      <td>{pct(a.macro_f1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!loading && data?.arms && Object.keys(data.arms).length > 0 ? (
          <section className="panel" aria-labelledby="per-class">
            <h2 id="per-class">Per-class F1</h2>
            <div className="table-scroll">
              <table className="metrics dense">
                <thead>
                  <tr>
                    <th>Subject</th>
                    {arms.map((a) => (
                      <th key={a.name}>{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.subjects || []).map((subj) => {
                    const rowF1 = arms.map((a) => {
                      const pc = data.arms?.[a.name]?.per_class as
                        | Record<string, { f1?: number }>
                        | undefined;
                      return pc?.[subj]?.f1;
                    });
                    const numeric = rowF1.filter(
                      (v): v is number => typeof v === "number" && !Number.isNaN(v),
                    );
                    const maxF1 = numeric.length > 0 ? Math.max(...numeric) : undefined;
                    return (
                      <tr key={subj}>
                        <td>{subj}</td>
                        {arms.map((a, i) => {
                          const f1 = rowF1[i];
                          const isBest =
                            typeof f1 === "number" &&
                            typeof maxF1 === "number" &&
                            f1 === maxF1;
                          return (
                            <td key={a.name}>
                              {isBest ? <strong>{pct(f1)}</strong> : pct(f1)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!loading && data?.updated_at ? (
          <p className="stamp">Updated {formatUpdatedStamp(data.updated_at)}</p>
        ) : null}

        <SiteFooter />
      </div>
      <style jsx>{`
        .app {
          max-width: 820px;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .hero {
          margin-bottom: 1.75rem;
          animation: rise 0.55s ease both;
        }

        h1 {
          margin: 0 0 0.55rem;
          font-family: var(--display);
          font-size: clamp(1.85rem, 4vw, 2.4rem);
          font-weight: 500;
          letter-spacing: -0.02em;
        }

        .toggle-row {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          cursor: pointer;
          user-select: none;
        }

        .toggle input {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-ui {
          position: relative;
          width: 2.4rem;
          height: 1.35rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--line) 85%, var(--mute));
          transition: background 0.18s ease;
          flex-shrink: 0;
        }

        .toggle-ui::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: calc(1.35rem - 4px);
          height: calc(1.35rem - 4px);
          border-radius: 50%;
          background: var(--surface);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
          transition: transform 0.18s ease;
        }

        .toggle input:checked + .toggle-ui {
          background: var(--accent);
        }

        .toggle input:checked + .toggle-ui::after {
          transform: translateX(1.05rem);
        }

        .toggle input:focus-visible + .toggle-ui {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .toggle input:disabled + .toggle-ui {
          opacity: 0.5;
        }

        .toggle-label {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--ink);
        }

        .toggle-hint {
          margin: 0.15rem 0 0;
          max-width: 36rem;
          font-size: 0.88rem;
          color: var(--mute);
        }

        .lede {
          margin: 0;
          max-width: 38rem;
          color: var(--mute);
          font-size: 1.02rem;
        }

        .panel {
          margin-bottom: 2rem;
          padding: 1.25rem 0 0;
          border-top: 1px solid var(--line);
          animation: rise 0.65s ease both;
          animation-delay: 80ms;
        }

        h2 {
          margin: 0 0 0.4rem;
          font-family: var(--display);
          font-size: 1.25rem;
          font-weight: 500;
        }

        .muted {
          color: var(--mute);
          font-size: 0.95rem;
          margin: 0 0 1rem;
        }

        .muted.tight {
          margin-bottom: 1.15rem;
        }

        .error {
          color: #9b2c2c;
          margin: 0 0 1rem;
        }

        .table-scroll {
          overflow-x: auto;
          margin-top: 1.35rem;
        }

        .metrics {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }

        .metrics.dense {
          font-size: 0.85rem;
        }

        .metrics th,
        .metrics td {
          text-align: left;
          padding: 0.65rem 0.45rem;
          border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
        }

        .metrics th {
          color: var(--mute);
          font-weight: 600;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .metrics td:not(:first-child),
        .metrics th:not(:first-child) {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .stamp {
          margin: 0.85rem 0 0;
          font-size: 0.75rem;
          color: var(--mute);
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
