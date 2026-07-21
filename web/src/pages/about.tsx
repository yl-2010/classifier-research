import Head from "next/head";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { AppNav } from "@/components/AppNav";
import { SiteFooter } from "@/components/SiteFooter";

const JUMP_KEY = "notelms-jump";

export default function AboutPage() {
  const { status } = useSession();
  const router = useRouter();
  const signedIn = status === "authenticated";

  const jumpHome = () => {
    sessionStorage.setItem(JUMP_KEY, "notebook");
    void router.push("/");
  };

  return (
    <>
      <Head>
        <title>About - NoteLMs</title>
      </Head>
      <div className="app">
        <AppNav
          active="about"
          onNotebook={signedIn ? jumpHome : undefined}
        />

        <header className="hero">
          <h1>About</h1>
          <p className="lede">
            NoteLMs helps students organize study notes, and every use feeds a
            research comparison of language models.
          </p>
        </header>

        <section className="panel" aria-labelledby="product">
          <h2 id="product">Product</h2>
          <p className="muted">
            Built for students who want notes sorted, readable, and easy to
            revisit out loud.
          </p>
          <ol className="list">
            <li>
              <strong>Categorizing notes</strong>
              <span>
                Paste a note or upload an image and NoteLMs assigns it to a
                subject so your library stays organized.
              </span>
            </li>
            <li>
              <strong>Formatting notes</strong>
              <span>
                Raw text from paste or image is turned into clean, structured
                HTML that’s easier to skim and study from.
              </span>
            </li>
            <li>
              <strong>Reading aloud</strong>
              <span>
                On Voice, paste text and hear it read back, useful for review
                without staring at a screen.
              </span>
            </li>
          </ol>
        </section>

        <section className="panel" aria-labelledby="technical">
          <h2 id="technical">Technical details</h2>
          <p className="muted">
            Under the hood, NoteLMs is also a live experiment in note
            classification.
          </p>
          <ol className="list">
            <li>
              <strong>Research goal</strong>
              <span>
                Compare zero-shot BERT, fine-tuned BERT, and a full reasoning
                LLM (GPT-OSS 20B) on academic subject classification.
              </span>
            </li>
            <li>
              <strong>Eval data</strong>
              <span>
                We’ve already run 2,000 offline evals. Every time someone uses
                the product, that classification is added to the research set.
              </span>
            </li>
            <li>
              <strong>How categorization works</strong>
              <span>
                Three models vote in parallel: zero-shot BERT, fine-tuned BERT,
                and GPT-OSS 20B. An orchestrator (also GPT-OSS 20B) reviews those
                votes and chooses the final subject.
              </span>
            </li>
            <li>
              <strong>How image notes work</strong>
              <span>
                Uploaded or dragged note photos are sent to OpenAI vision, which
                extracts the raw text; that text then goes through the same
                classify → format → save pipeline as pasted notes.
              </span>
            </li>
            <li>
              <strong>How reading aloud works</strong>
              <span>
                Text is split into smaller chunks, then Orpheus 3B
                (orpheus-3b-0.1-ft) synthesizes speech chunk by chunk so longer
                passages stay clear and stable.
              </span>
            </li>
          </ol>
        </section>

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

        .hero {
          margin-bottom: 1.5rem;
          animation: rise 0.55s ease both;
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
          max-width: 36rem;
          color: var(--mute);
          font-size: 1.05rem;
          line-height: 1.55;
        }

        .panel {
          margin-bottom: 1.75rem;
          padding: 1.35rem 0 0;
          border-top: 1px solid var(--line);
          animation: rise 0.65s ease both;
        }

        .panel:nth-of-type(2) {
          animation-delay: 70ms;
        }

        .panel:nth-of-type(3) {
          animation-delay: 140ms;
        }

        h2 {
          margin: 0 0 0.35rem;
          font-family: var(--display);
          font-size: 1.3rem;
          font-weight: 500;
        }

        .muted {
          margin: 0 0 1.15rem;
          color: var(--mute);
          font-size: 0.95rem;
          line-height: 1.5;
          max-width: 36rem;
        }

        .list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }

        .list li {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .list strong {
          font-size: 0.98rem;
          font-weight: 600;
          color: var(--ink);
        }

        .list span {
          color: var(--mute);
          font-size: 0.95rem;
          line-height: 1.55;
          max-width: 38rem;
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
