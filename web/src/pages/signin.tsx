import Head from "next/head";
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
        <title>Sign in — NoteLMs</title>
      </Head>
      <main className="shell">
        <div className="panel">
          <img
            className="brand-logo"
            src="/logo-nav.svg"
            alt="NoteLMs"
            width={200}
            height={83}
            decoding="async"
          />
          <button
            type="button"
            className="btn"
            onClick={() => void signIn("google", { callbackUrl: "/" })}
            disabled={status === "loading"}
          >
            Sign in with Google
          </button>
        </div>
        <SiteFooter />
      </main>
      <style jsx>{`
        .shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 4vw, 2rem) 0;
          max-width: 420px;
          margin: 0 auto;
        }

        .panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .brand-logo {
          display: block;
          width: min(200px, 70vw);
          height: auto;
          margin: 0 0 1.25rem;
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
