import Head from "next/head";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { AppNav } from "@/components/AppNav";
import { SiteFooter } from "@/components/SiteFooter";
import { useUiContext } from "@/lib/uiContext";

const JUMP_KEY = "notelms-jump";

/** Served from web/public/documents/paper.pdf */
const PAPER_PDF_SRC = "/documents/paper.pdf";

const PaperPdfViewer = dynamic(
  () =>
    import("@/components/PaperPdfViewer").then((m) => m.PaperPdfViewer),
  {
    ssr: false,
    loading: () => <div className="paper-loading">Loading paper…</div>,
  }
);

export default function PaperPage() {
  const { status } = useSession();
  const router = useRouter();
  const signedIn = status === "authenticated";
  const { setUiContext } = useUiContext();

  useEffect(() => {
    setUiContext({
      page: "paper",
      subject: null,
      noteId: null,
      noteTitle: null,
      noteText: null,
    });
  }, [setUiContext]);

  const jumpHome = () => {
    sessionStorage.setItem(JUMP_KEY, "notebook");
    void router.push("/");
  };

  return (
    <>
      <Head>
        <title>Paper - NoteLMs</title>
      </Head>
      <div className="app">
        <AppNav
          active="paper"
          onNotebook={signedIn ? jumpHome : undefined}
        />

        <div className="paper-frame">
          <PaperPdfViewer
            src={PAPER_PDF_SRC}
            title="NoteLMs — A Three-Model Organization Framework for Student Notes"
          />
        </div>

        <SiteFooter />
      </div>
      <style jsx>{`
        .app {
          max-width: 920px;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .paper-frame {
          flex: 1;
          width: 100%;
          margin-bottom: 1.5rem;
        }

        .app :global(.paper-loading) {
          min-height: 12rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--mute);
          font-size: 0.95rem;
        }

        @media (max-width: 640px) {
          .app {
            padding-left: 0.85rem;
            padding-right: 0.85rem;
          }
        }
      `}</style>
    </>
  );
}
