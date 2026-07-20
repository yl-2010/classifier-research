import Head from "next/head";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { ClusteredMetricsChart, type ArmMetrics } from "@/components/ClusteredMetricsChart";
import { SiteFooter } from "@/components/SiteFooter";

const JUMP_KEY = "notelms-jump";

type EvalPayload = {
  subjects?: string[];
  test_n?: number;
  updated_at?: string;
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

export default function ResearchPage() {
  const { status } = useSession();
  const router = useRouter();
  const signedIn = status === "authenticated";
  const [data, setData] = useState<EvalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/research-metrics.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load metrics (${res.status})`);
        const json = (await res.json()) as EvalPayload;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load research metrics");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const jumpHome = (section: "new" | "library") => {
    sessionStorage.setItem(JUMP_KEY, section);
    void router.push("/");
  };

  return (
    <>
      <Head>
        <title>Research - NoteLMs</title>
      </Head>
      <div className="app">
        <AppNav
          active="research"
          onNew={signedIn ? () => jumpHome("new") : undefined}
          onLibrary={signedIn ? () => jumpHome("library") : undefined}
        />

        <header className="hero">
          <p className="kicker">Shared results · frozen test</p>
          <h1>Research</h1>
        </header>

        {error ? <p className="error">{error}</p> : null}
        {!data && !error ? <p className="muted">Loading metrics…</p> : null}

        {arms.length > 0 ? (
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
            {data?.updated_at ? (
              <p className="stamp">Updated {formatUpdatedStamp(data.updated_at)}</p>
            ) : null}
          </section>
        ) : null}

        {data?.arms && Object.keys(data.arms).length > 0 ? (
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

        .kicker {
          margin: 0 0 0.35rem;
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--mute);
          font-weight: 600;
        }

        h1 {
          margin: 0 0 0.55rem;
          font-family: var(--display);
          font-size: clamp(1.85rem, 4vw, 2.4rem);
          font-weight: 500;
          letter-spacing: -0.02em;
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
