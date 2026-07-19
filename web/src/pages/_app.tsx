import type { AppProps } from "next/app";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import "../styles/globals.css";

/** When a session is present, make sure the Mac Studio email folder exists. */
function EnsureMacUserFolder() {
  const { status } = useSession();
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || attempted.current) return;
    attempted.current = true;
    void fetch("/api/ensure-user", { method: "POST" }).catch(() => {
      /* Mac/tunnel may be offline; Auth.js signIn event is the primary path */
    });
  }, [status]);

  return null;
}

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
  return (
    <SessionProvider session={session}>
      <EnsureMacUserFolder />
      <Component {...pageProps} />
    </SessionProvider>
  );
}
