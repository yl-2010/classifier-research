export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="NoteLMs">
      <img
        className="footer-logo"
        src="/logo-footer.svg"
        alt=""
        width={306}
        height={90}
        decoding="async"
      />
      <style jsx>{`
        .site-footer {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2.5rem 1.25rem 3rem;
          margin-top: auto;
        }

        .footer-logo {
          display: block;
          width: min(220px, 55vw);
          height: auto;
          opacity: 0.14;
          pointer-events: none;
          user-select: none;
        }
      `}</style>
    </footer>
  );
}
