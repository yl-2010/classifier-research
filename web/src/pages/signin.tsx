import Head from "next/head";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { SiteFooter } from "@/components/SiteFooter";

export default function SignInPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      void router.replace("/");
    }
  }, [status, router]);

  return (
    <>
      <Head>
        <title>Sign in - NoteLMs</title>
      </Head>
      <main className="shell">
        <div className="panel">
          <img
            className="brand-logo"
            src="/logo-plain.svg"
            alt="NoteLMs"
            width={864}
            height={360}
            decoding="async"
          />
          <p className="lead">
            Classify and organize your notes, and help build research along the
            way.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => void signIn("google", { callbackUrl: "/" })}
              disabled={status === "loading"}
            >
              Sign in with Google
            </button>
            <Link href="/research" className="btn research">
              View Research
            </Link>
          </div>
        </div>
        <SiteFooter />
      </main>
      <style jsx>{`
        .shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          padding: clamp(2.5rem, 8vh, 5rem) clamp(1.25rem, 4vw, 2rem) 0;
          max-width: 860px;
          margin: 0 auto;
        }

        .panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 1.5rem;
          padding-bottom: 2rem;
        }

        .brand-logo {
          display: block;
          width: min(520px, 86vw);
          height: auto;
          opacity: 1;
        }

        .lead {
          margin: 0;
          max-width: 28rem;
          color: var(--mute);
          font-size: clamp(1.05rem, 2.4vw, 1.2rem);
          line-height: 1.55;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }

        .btn {
          border: 0;
          cursor: pointer;
          font-weight: 600;
          padding: 0.7rem 1.15rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
        }

        .btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        :global(.research),
        .research {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          background: color-mix(in srgb, var(--ink) 7%, transparent);
          color: var(--ink);
          box-shadow: inset 0 0 0 1.5px
            color-mix(in srgb, var(--accent) 35%, transparent);
        }

        :global(.research:hover),
        .research:hover {
          background: color-mix(in srgb, var(--accent) 12%, transparent);
        }
      `}</style>
    </>
  );
}
