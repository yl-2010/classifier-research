import Head from "next/head";

export default function HomePage() {
  return (
    <>
      <Head>
        <title>NoteLMS</title>
        <meta
          name="description"
          content="NoteLMS turns student notes into clear subject understanding."
        />
      </Head>
      <main className="hero">
        <div className="atmosphere" aria-hidden="true" />
        <p className="brand">NoteLMS</p>
        <h1>Know what your notes are really about.</h1>
        <p className="lede">
          A focused study companion that classifies and organizes student notes
          so revision stays clear.
        </p>
        <div className="cta">
          <a className="primary" href="#waitlist">
            Join the waitlist
          </a>
        </div>
      </main>
      <style jsx>{`
        .hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: clamp(2rem, 6vw, 5rem);
          max-width: 920px;
          overflow: hidden;
        }

        .atmosphere {
          position: absolute;
          inset: auto -10% -20% 35%;
          height: min(70vh, 560px);
          background:
            radial-gradient(circle at 30% 40%, rgba(216, 227, 106, 0.22), transparent 45%),
            radial-gradient(circle at 70% 60%, rgba(120, 196, 176, 0.28), transparent 50%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.05), transparent 60%);
          filter: blur(8px);
          pointer-events: none;
          animation: drift 14s ease-in-out infinite alternate;
        }

        .brand {
          position: relative;
          margin: 0 0 1.1rem;
          font-family: Fraunces, Georgia, serif;
          font-size: clamp(2.6rem, 7vw, 4.4rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1;
          animation: rise 0.8s ease-out both;
        }

        h1 {
          position: relative;
          margin: 0;
          max-width: 14ch;
          font-family: Fraunces, Georgia, serif;
          font-size: clamp(1.7rem, 4.2vw, 2.55rem);
          font-weight: 500;
          line-height: 1.15;
          letter-spacing: -0.02em;
          animation: rise 0.9s ease-out 0.08s both;
        }

        .lede {
          position: relative;
          margin: 1.15rem 0 0;
          max-width: 34rem;
          color: var(--ink-muted);
          font-size: clamp(1.05rem, 2.2vw, 1.22rem);
          line-height: 1.55;
          animation: rise 1s ease-out 0.16s both;
        }

        .cta {
          position: relative;
          margin-top: 2rem;
          animation: rise 1.05s ease-out 0.24s both;
        }

        .primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2.85rem;
          padding: 0.7rem 1.25rem;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 600;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(216, 227, 106, 0.22);
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes drift {
          from {
            transform: translate3d(0, 0, 0) scale(1);
          }
          to {
            transform: translate3d(-3%, -2%, 0) scale(1.04);
          }
        }
      `}</style>
    </>
  );
}
