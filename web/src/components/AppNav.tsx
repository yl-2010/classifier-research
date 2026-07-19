import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

type AppNavProps = {
  active?: "new" | "library" | "research";
  onNew?: () => void;
  onLibrary?: () => void;
};

export function AppNav({ active, onNew, onLibrary }: AppNavProps) {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <header className="top">
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
              className={`nav-research${active === "research" ? " active" : ""}`}
            >
              Research
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
      <style jsx>{`
        .top {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin: 0 -0.25rem 1.75rem;
          padding: 0.65rem 0.25rem;
          background: transparent;
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

        :global(.nav-research) {
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

        :global(.nav-research:hover),
        :global(.nav-research.active) {
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
