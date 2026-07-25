import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

/** Same-origin worker from /public (copied from pdfjs-dist; satisfies CSP). */
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Props = {
  src: string;
  title: string;
};

/**
 * Renders every PDF page as a canvas in document flow so phone browsers
 * (notably iOS Safari, which often only shows page 1 in an iframe) can
 * scroll through the full paper with native page scrolling.
 */
export function PaperPdfViewer({ src, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderWidth, setRenderWidth] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const next = Math.max(1, Math.floor(host.clientWidth));
      setRenderWidth((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || renderWidth <= 0) return;

    let cancelled = false;
    const pagesRoot = host.querySelector<HTMLElement>("[data-pdf-pages]");
    if (!pagesRoot) return;

    setStatus("loading");
    setError(null);
    pagesRoot.replaceChildren();

    void (async () => {
      try {
        const pdf = await getDocument({ url: src, withCredentials: false }).promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        setPageCount(pdf.numPages);
        const dpr = Math.min(
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
          2
        );

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) {
            page.cleanup();
            break;
          }

          const base = page.getViewport({ scale: 1 });
          const cssScale = renderWidth / base.width;
          const viewport = page.getViewport({ scale: cssScale * dpr });

          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${renderWidth}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.setAttribute(
            "aria-label",
            `${title}, page ${pageNum} of ${pdf.numPages}`
          );

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            page.cleanup();
            throw new Error("Canvas is not available in this browser");
          }

          pagesRoot.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
          page.cleanup();
        }

        if (!cancelled) setStatus("ready");
        await pdf.destroy();
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not load the PDF");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, title, renderWidth]);

  return (
    <div className="pdf-viewer" ref={hostRef}>
      <div className="pdf-toolbar">
        <span className="pdf-meta">
          {status === "ready" && pageCount > 0
            ? `${pageCount} page${pageCount === 1 ? "" : "s"}`
            : status === "loading"
              ? "Loading paper…"
              : "PDF unavailable"}
        </span>
        <a className="pdf-open" href={src} target="_blank" rel="noopener noreferrer">
          Open PDF
        </a>
      </div>

      {status === "error" ? (
        <div className="pdf-error" role="alert">
          <p>{error || "Could not display the paper in this browser."}</p>
          <a href={src} target="_blank" rel="noopener noreferrer">
            Open the PDF directly
          </a>
        </div>
      ) : null}

      <div
        className="pdf-pages"
        data-pdf-pages
        aria-busy={status === "loading"}
        aria-label={title}
      />

      <style jsx>{`
        .pdf-viewer {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          animation: rise 0.55s ease both;
        }

        .pdf-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          font-size: 0.9rem;
          color: var(--mute);
        }

        .pdf-open {
          color: var(--accent);
          font-weight: 560;
          text-decoration: underline;
          text-underline-offset: 0.15em;
        }

        .pdf-pages {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          width: 100%;
          min-height: 12rem;
        }

        .pdf-viewer :global(.pdf-page) {
          display: block;
          width: 100%;
          height: auto;
          border-radius: var(--radius);
          background: var(--surface);
          box-shadow: 0 1px 0 color-mix(in srgb, var(--line) 80%, transparent);
        }

        .pdf-error {
          padding: 1.25rem;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--surface);
          color: var(--ink);
        }

        .pdf-error p {
          margin: 0 0 0.65rem;
        }

        .pdf-error a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 0.15em;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
