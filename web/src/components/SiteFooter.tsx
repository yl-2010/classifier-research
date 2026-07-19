export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="NoteLMs">
      <img
        className="footer-logo"
        src="/logo-footer.svg"
        alt=""
        width={1224}
        height={360}
        decoding="async"
      />
      <style jsx>{`
        .site-footer {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100vw;
          margin-top: auto;
          margin-left: calc(50% - 50vw);
          padding: 3rem clamp(1rem, 3.5vw, 2.25rem) 3.25rem;
          box-sizing: border-box;
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
      `}</style>
    </footer>
  );
}
