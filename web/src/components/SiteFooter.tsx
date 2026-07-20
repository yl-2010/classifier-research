import { signOut, useSession } from "next-auth/react";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <footer className="site-footer">
      <img
        className="footer-logo"
        src="/logo-footer.svg"
        alt=""
        width={1224}
        height={360}
        decoding="async"
      />
      <div className="footer-meta">
        <p className="copy">© {year} Yan Levin. All rights reserved.</p>
        {signedIn ? (
          <button
            type="button"
            className="sign-out"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            Sign out
          </button>
        ) : (
          <p className="tag">
            NoteLMs helps students organize notes while building research data.
          </p>
        )}
      </div>
      <style jsx>{`
        .site-footer {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: stretch;
          width: 100vw;
          margin-top: auto;
          margin-left: calc(50% - 50vw);
          padding: 3rem clamp(1rem, 3.5vw, 2.25rem) 2.5rem;
          box-sizing: border-box;
          gap: 1.25rem;
        }

        .footer-logo {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          opacity: 0.12;
          pointer-events: none;
          user-select: none;
        }

        .footer-meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem 1.5rem;
          max-width: 720px;
          width: 100%;
          margin: 0 auto;
          padding: 0 0.15rem;
        }

        .copy,
        .tag,
        .sign-out {
          margin: 0;
          color: var(--mute);
          font-size: 0.8rem;
          letter-spacing: 0.01em;
        }

        .tag {
          opacity: 0.85;
        }

        .sign-out {
          border: 0;
          background: none;
          padding: 0;
          cursor: pointer;
          font: inherit;
          opacity: 0.85;
        }

        .sign-out:hover {
          color: var(--ink);
          opacity: 1;
        }
      `}</style>
    </footer>
  );
}
