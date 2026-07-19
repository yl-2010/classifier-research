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
        Note<span>LMs</span>
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
          padding: 0.85rem 0.25rem;
          background: color-mix(in srgb, var(--bg) 88%, transparent);
          backdrop-filter: blur(10px);
        }

        :global(.brand) {
          border: 0;
          background: none;
          padding: 0;
          cursor: pointer;
          font-family: var(--display);
          font-size: 1.35rem;
          color: var(--ink);
          letter-spacing: -0.02em;
          text-decoration: none;
        }

        :global(.brand span) {
          color: var(--accent);
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
