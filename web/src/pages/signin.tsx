import Head from "next/head";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";

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
        <title>Sign in — NoteLMs</title>
      </Head>
      <main className="shell">
        <p className="brand">NoteLMs</p>
        <h1>Sign in</h1>
        <p className="lede">Use your Google account to continue.</p>
        <button
          type="button"
          className="google"
          onClick={() => void signIn("google", { callbackUrl: "/" })}
          disabled={status === "loading"}
        >
          Continue with Google
        </button>
      </main>
      <style jsx>{`
        .shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: clamp(2rem, 6vw, 5rem);
          max-width: 420px;
        }

        .brand {
          margin: 0 0 1rem;
          font-family: Fraunces, Georgia, serif;
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        h1 {
          margin: 0;
          font-family: Fraunces, Georgia, serif;
          font-size: 1.8rem;
          font-weight: 500;
        }

        .lede {
          margin: 0.75rem 0 0;
          color: var(--ink-muted);
          line-height: 1.5;
        }

        .google {
          margin-top: 1.75rem;
          min-height: 2.85rem;
          padding: 0.7rem 1.25rem;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 600;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .google:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(216, 227, 106, 0.22);
        }

        .google:disabled {
          opacity: 0.7;
          cursor: wait;
        }
      `}</style>
    </>
  );
}
