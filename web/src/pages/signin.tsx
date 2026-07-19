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
        <p className="brand">
          Note<span>LMs</span>
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void signIn("google", { callbackUrl: "/" })}
          disabled={status === "loading"}
        >
          Sign in with Google
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
          margin: 0 auto;
        }

        .brand {
          margin: 0 0 1.25rem;
          font-family: var(--display);
          font-size: 2.2rem;
          font-weight: 500;
          letter-spacing: -0.02em;
        }

        .brand span {
          color: var(--accent);
        }

        .btn {
          border: 0;
          cursor: pointer;
          font-weight: 600;
          padding: 0.7rem 1.15rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
          align-self: flex-start;
        }

        .btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
      `}</style>
    </>
  );
}
