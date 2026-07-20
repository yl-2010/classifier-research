import Head from "next/head";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { SiteFooter } from "@/components/SiteFooter";
import { loadResearch } from "@/lib/research-store";
import type { ResearchRow } from "@/lib/atelier-data";

const JUMP_KEY = "notelms-jump";

export default function ResearchPage() {
  const { status } = useSession();
  const router = useRouter();
  const signedIn = status === "authenticated";
  const [rows, setRows] = useState<ResearchRow[]>([]);

  useEffect(() => {
    setRows(loadResearch());
    const onFocus = () => setRows(loadResearch());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
        <h1 className="section-label">Research</h1>
        {rows.length === 0 ? (
          <p className="muted">
            {signedIn
              ? "No classifications yet. Send a note and corrections will show up here."
              : "Sign in to contribute classifications. Research rows appear here as notes are processed."}
          </p>
        ) : (
          <table className="research">
            <thead>
              <tr>
                <th>When</th>
                <th>Orchestrator</th>
                <th>Final</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.id}-${r.when}-${r.final}-${r.corrected}`}>
                  <td>{r.when}</td>
                  <td>{r.orchestrator}</td>
                  <td>{r.final}</td>
                  <td>{r.corrected ? "Manual" : "Auto"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <SiteFooter />
      </div>
      <style jsx>{`
        .app {
          max-width: 720px;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .section-label {
          margin: 0 0 1rem;
          font-family: var(--display);
          font-size: 1.35rem;
          font-weight: 500;
        }

        .muted {
          color: var(--mute);
          font-size: 0.95rem;
          margin: 0 0 1rem;
        }

        .research {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .research th,
        .research td {
          text-align: left;
          padding: 0.7rem 0.4rem;
        }

        .research th {
          color: var(--mute);
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .research tbody tr:nth-child(odd) td {
          background: color-mix(in srgb, var(--surface) 70%, transparent);
        }
      `}</style>
    </>
  );
}
