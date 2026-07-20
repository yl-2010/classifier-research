import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

type AppNavProps = {
  active?: "new" | "library" | "research" | "voice";
  onNew?: () => void;
  onLibrary?: () => void;
};

export function AppNav({ active, onNew, onLibrary }: AppNavProps) {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <header className="top">
      <div className="nav-veil" aria-hidden="true">
        <div className="nav-blur nav-blur-1" />
        <div className="nav-blur nav-blur-2" />
        <div className="nav-blur nav-blur-3" />
        <div className="nav-blur nav-blur-4" />
        <div className="nav-blur nav-blur-5" />
        <div className="nav-solid" />
      </div>
      <div className="nav-bar">
        <Link
          href="/"
          className="brand"
          onClick={(e) => {
            if (!onNew) return;
            e.preventDefault();
            onNew();
          }}
        >
          <img
            className="brand-logo"
            src="/logo-nav.svg"
            alt="NoteLMs"
            width={172}
            height={72}
            decoding="async"
          />
        </Link>
        <nav className="nav">
          {signedIn ? (
            <>
              <button
                type="button"
                className={active === "new" ? "active" : undefined}
                onClick={onNew}
              >
                New
              </button>
              <button
                type="button"
                className={active === "library" ? "active" : undefined}
                onClick={onLibrary}
              >
                Library
              </button>
              <Link
                href="/research"
                className={`nav-pill${active === "research" ? " active" : ""}`}
              >
                Research
              </Link>
              <Link
                href="/voice"
                className={`nav-pill${active === "voice" ? " active" : ""}`}
              >
                Voice
              </Link>
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => void signIn("google", { callbackUrl: "/" })}
              disabled={status === "loading"}
            >
              Sign in with Google
            </button>
          )}
        </nav>
      </div>
      <style jsx>{`
        .top {
          position: sticky;
          top: 0;
          z-index: 20;
          margin: 0 -0.25rem 1.75rem;
          padding: 0.65rem 0.25rem;
          background: transparent;
        }

        .nav-veil {
          position: absolute;
          left: 50%;
          top: 0;
          z-index: 0;
          width: 100vw;
          height: calc(100% + 2.75rem);
          transform: translateX(-50%);
          pointer-events: none;
        }

        .nav-blur,
        .nav-solid {
          position: absolute;
          inset: 0;
        }

        .nav-blur {
          -webkit-backdrop-filter: blur(var(--blur));
          backdrop-filter: blur(var(--blur));
          -webkit-mask-image: var(--mask);
          mask-image: var(--mask);
        }

        .nav-blur-1 {
          --blur: 1px;
          --mask: linear-gradient(
            to bottom,
            black 0%,
            black 55%,
            transparent 100%
          );
        }

        .nav-blur-2 {
          --blur: 2px;
          --mask: linear-gradient(
            to bottom,
            black 0%,
            black 45%,
            transparent 80%
          );
        }

        .nav-blur-3 {
          --blur: 4px;
          --mask: linear-gradient(
            to bottom,
            black 0%,
            black 35%,
            transparent 65%
          );
        }

        .nav-blur-4 {
          --blur: 8px;
          --mask: linear-gradient(
            to bottom,
            black 0%,
            black 25%,
            transparent 50%
          );
        }

        .nav-blur-5 {
          --blur: 16px;
          --mask: linear-gradient(
            to bottom,
            black 0%,
            black 15%,
            transparent 38%
          );
        }

        .nav-solid {
          background: linear-gradient(
            to bottom,
            var(--bg) 0%,
            var(--bg) 42%,
            color-mix(in srgb, var(--bg) 55%, transparent) 68%,
            transparent 100%
          );
        }

        .nav-bar {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        :global(.brand) {
          border: 0;
          background: transparent;
          padding: 0;
          cursor: pointer;
          line-height: 0;
          text-decoration: none;
          flex-shrink: 0;
        }

        :global(.brand-logo),
        .brand-logo {
          display: block;
          width: auto;
          height: 3.05rem;
          border: 0;
          outline: 0;
          background: transparent;
          /* Avoid a rectangular compositing box around transparent SVG pixels */
          mix-blend-mode: normal;
          isolation: auto;
        }

        .nav {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.85rem;
        }

        .nav > button:not(.btn) {
          border: 0;
          background: none;
          padding: 0;
          cursor: pointer;
          color: var(--mute);
          font-size: 0.9rem;
        }

        .nav > button:not(.btn):hover,
        .nav > button.active {
          color: var(--ink);
        }

        :global(.nav-pill) {
          display: inline-flex;
          align-items: center;
          padding: 0.28rem 0.65rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          color: var(--accent);
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: none;
        }

        :global(.nav-pill:hover),
        :global(.nav-pill.active) {
          background: color-mix(in srgb, var(--accent) 20%, transparent);
          color: var(--ink);
        }

        :global(.btn) {
          border: 0;
          cursor: pointer;
          font-weight: 600;
          padding: 0.7rem 1.15rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
        }

        :global(.btn:disabled) {
          opacity: 0.7;
          cursor: wait;
        }
      `}</style>
    </header>
  );
}
