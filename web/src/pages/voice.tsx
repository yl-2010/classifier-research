import Head from "next/head";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { AppNav } from "@/components/AppNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  OrpheusVoicePlayer,
  type VoicePlayerUi,
} from "@/lib/orpheusVoicePlayer";
import { notelmsFetch, useNotelmsRuntimeConfig } from "@/lib/notelmsApi";

const DEFAULT_VOICES = [
  "tara",
  "leah",
  "jess",
  "leo",
  "dan",
  "mia",
  "zac",
  "zoe",
];

const INITIAL_UI: VoicePlayerUi = {
  status: "Checking Voice service…",
  statusKind: "",
  progressDone: 0,
  progressTotal: 0,
  progressVisible: false,
  mediaVisible: false,
  lyricsVisible: false,
  speakDisabled: false,
  stopVisible: false,
  playLabel: "Play",
  playDisabled: true,
  rewindDisabled: true,
  playbackTime: "0:00 / 0:00",
  playbackHeardLabel: "Heard up to 0:00",
  playbackBarMax: 0.01,
  playbackBarValue: 0,
  playbackBarDisabled: true,
  lyricsHtml: "",
};

export default function VoicePage() {
  const { status } = useSession();
  const router = useRouter();
  const signedIn = status === "authenticated";
  const { apiBase, loading: configLoading } = useNotelmsRuntimeConfig();

  const [text, setText] = useState("");
  const [voices, setVoices] = useState(DEFAULT_VOICES);
  const [voice, setVoice] = useState("dan");
  const [ui, setUi] = useState<VoicePlayerUi>(INITIAL_UI);
  const [connection, setConnection] = useState<"checking" | "ok" | "error">(
    "checking"
  );
  const playerRef = useRef<OrpheusVoicePlayer | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      void router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    const player = new OrpheusVoicePlayer(setUi);
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!signedIn || configLoading || !apiBase) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await notelmsFetch(apiBase, "/api/voice/health");
        const data = (await res.json()) as {
          voices?: string[];
          default_voice?: string;
          lm_studio?: { ok?: boolean; error?: string };
          error?: string;
        };
        if (cancelled) return;

        if (Array.isArray(data.voices) && data.voices.length) {
          setVoices(data.voices);
        }
        if (data.default_voice) {
          setVoice(data.default_voice);
        }

        if (data.lm_studio?.ok) {
          setConnection("ok");
          playerRef.current?.setStatus("");
        } else {
          setConnection("error");
          playerRef.current?.setStatus(
            `Voice service issue: ${data.lm_studio?.error || data.error || "TTS unreachable"}. Start LM Studio with Orpheus and run npm run tts.`,
            "error"
          );
        }
      } catch (err) {
        if (!cancelled) {
          setConnection("error");
          playerRef.current?.setStatus(
            err instanceof Error ? err.message : "Could not reach Voice API",
            "error"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, apiBase, configLoading]);

  const jumpHome = () => {
    sessionStorage.setItem("notelms-jump", "notebook");
    void router.push("/");
  };

  const onSpeak = () => {
    const player = playerRef.current;
    if (!player || !apiBase) {
      playerRef.current?.setStatus("API not configured.", "error");
      return;
    }

    void player.speak({
      text: text.trim(),
      rawText: text,
      voice,
      fetchStream: (body, signal) =>
        notelmsFetch(apiBase, "/api/voice/synthesize/stream", {
          method: "POST",
          body: JSON.stringify(body),
          signal,
        }),
    });
  };

  const onClear = () => {
    playerRef.current?.stopPlayback();
    setText("");
    playerRef.current?.setStatus("Ready.");
    window.setTimeout(() => textRef.current?.focus(), 0);
  };

  const canClear =
    Boolean(text) ||
    ui.mediaVisible ||
    ui.lyricsVisible ||
    ui.stopVisible ||
    ui.progressVisible;

  const onLyricsClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest(
      ".lyrics-word.seekable"
    ) as HTMLElement | null;
    if (!target) return;
    const chunkIndex = parseInt(target.dataset.chunk ?? "", 10);
    const wordIndex = parseInt(target.dataset.word ?? "", 10);
    if (Number.isNaN(chunkIndex) || Number.isNaN(wordIndex)) return;
    playerRef.current?.seekToWord(chunkIndex, wordIndex);
  };

  if (status === "loading" || !signedIn) {
    return (
      <div className="app">
        <AppNav active="voice" />
        <SiteFooter />
        <style jsx>{`
          .app {
            max-width: 720px;
            margin: 0 auto;
            padding: 1.25rem 1.25rem 0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Voice — NoteLMs</title>
      </Head>
      <div className="app">
        <AppNav active="voice" onNotebook={jumpHome} />

        <h1 className="section-label">Voice</h1>

        {!ui.lyricsVisible && (
          <textarea
            ref={textRef}
            className={
              connection === "ok"
                ? "conn-ok"
                : connection === "error"
                  ? "conn-error"
                  : ""
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type text here…"
            rows={12}
            disabled={ui.speakDisabled}
            aria-invalid={connection === "error" || undefined}
          />
        )}

        {ui.lyricsVisible && (
          <div
            id="voice-lyrics-scroll"
            className="lyrics-scroll"
            aria-live="polite"
            onClick={onLyricsClick}
            dangerouslySetInnerHTML={{ __html: ui.lyricsHtml }}
          />
        )}

        <div className="row">
          <label className="voice-field">
            <span>Voice</span>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={ui.speakDisabled}
            >
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {ui.stopVisible && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                playerRef.current?.stopPlayback();
                playerRef.current?.setStatus("Stopped.");
              }}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={onClear}
            disabled={!canClear}
            aria-label="Clear text and reset voice session"
          >
            Clear
          </button>
          <button
            type="button"
            className="btn"
            onClick={onSpeak}
            disabled={ui.speakDisabled || !apiBase}
          >
            Speak
          </button>
        </div>

        {ui.mediaVisible && (
          <div className="media">
            <div className="media-buttons">
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => playerRef.current?.togglePlayPause()}
                disabled={ui.playDisabled}
                aria-label="Play or pause"
              >
                {ui.playLabel}
              </button>
              <button
                type="button"
                className="btn ghost icon"
                onClick={() => playerRef.current?.rewindFiveSeconds()}
                disabled={ui.rewindDisabled}
                aria-label="Rewind 5 seconds"
              >
                −5s
              </button>
              <span className="time">{ui.playbackTime}</span>
            </div>
            <input
              type="range"
              min={0}
              max={ui.playbackBarMax}
              step={0.01}
              value={ui.playbackBarValue}
              disabled={ui.playbackBarDisabled}
              aria-label="Playback position"
              onPointerDown={() => playerRef.current?.beginScrub()}
              onChange={(e) =>
                playerRef.current?.scrubTo(parseFloat(e.target.value))
              }
              onPointerUp={(e) =>
                playerRef.current?.endScrub(
                  parseFloat((e.target as HTMLInputElement).value)
                )
              }
            />
            <div className="playback-labels">
              <span>Start</span>
              <span>{ui.playbackHeardLabel}</span>
            </div>
          </div>
        )}

        {ui.progressVisible && (
          <progress
            className="progress"
            value={ui.progressDone}
            max={ui.progressTotal || 1}
          />
        )}

        {ui.status ? (
          <p
            className={`status${ui.statusKind ? ` ${ui.statusKind}` : ""}`}
            role="status"
          >
            {ui.status}
          </p>
        ) : null}

        <SiteFooter />
      </div>

      <style jsx>{`
        .app {
          max-width: 720px;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .section-label {
          margin: 0 0 1.25rem;
          font-family: var(--display);
          font-size: 1.35rem;
          font-weight: 500;
        }

        textarea {
          width: 100%;
          resize: vertical;
          padding: 0.9rem 1rem;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--surface);
          color: var(--ink);
          line-height: 1.5;
          transition:
            border-color 0.25s ease,
            box-shadow 0.35s ease;
        }

        textarea:focus {
          outline: none;
        }

        textarea.conn-ok {
          border-color: color-mix(in srgb, #2f9d6a 55%, var(--line));
          box-shadow:
            0 0 0 1px color-mix(in srgb, #2f9d6a 28%, transparent),
            0 0 18px color-mix(in srgb, #3cb371 42%, transparent),
            0 0 42px color-mix(in srgb, #2f9d6a 22%, transparent);
        }

        textarea.conn-ok:focus {
          border-color: #2f9d6a;
          box-shadow:
            0 0 0 1px color-mix(in srgb, #2f9d6a 45%, transparent),
            0 0 22px color-mix(in srgb, #3cb371 55%, transparent),
            0 0 48px color-mix(in srgb, #2f9d6a 28%, transparent);
        }

        textarea.conn-error {
          border-color: color-mix(in srgb, #c94444 55%, var(--line));
          box-shadow:
            0 0 0 1px color-mix(in srgb, #c94444 28%, transparent),
            0 0 18px color-mix(in srgb, #e25555 42%, transparent),
            0 0 42px color-mix(in srgb, #c94444 22%, transparent);
        }

        textarea.conn-error:focus {
          border-color: #c94444;
          box-shadow:
            0 0 0 1px color-mix(in srgb, #c94444 45%, transparent),
            0 0 22px color-mix(in srgb, #e25555 55%, transparent),
            0 0 48px color-mix(in srgb, #c94444 28%, transparent);
        }

        .row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: end;
          margin-top: 1rem;
        }

        .voice-field {
          flex: 1;
          min-width: 140px;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          color: var(--mute);
          font-size: 0.85rem;
        }

        .voice-field select {
          padding: 0.65rem 0.75rem;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--surface);
          color: var(--ink);
        }

        .btn {
          border: 1px solid transparent;
          cursor: pointer;
          font-weight: 600;
          padding: 0.7rem 1.15rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
        }

        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .btn.ghost {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
        }

        .btn.ghost:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        }

        .btn.icon {
          min-width: 3.25rem;
          padding: 0.65rem 0.85rem;
        }

        .media {
          margin-top: 1rem;
          padding: 0.9rem 1rem;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--surface);
        }

        .media-buttons {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.65rem;
        }

        .time {
          margin-left: auto;
          font-size: 0.85rem;
          color: var(--mute);
          font-variant-numeric: tabular-nums;
        }

        .media input[type="range"] {
          width: 100%;
          accent-color: var(--accent);
        }

        .playback-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 0.25rem;
          font-size: 0.75rem;
          color: var(--mute);
        }

        .progress {
          width: 100%;
          margin-top: 0.85rem;
          height: 0.45rem;
          accent-color: var(--accent);
        }

        .status {
          margin: 1rem 0 0;
          min-height: 1.4em;
          color: var(--mute);
          font-size: 0.95rem;
        }

        .status.ok {
          color: #1f6b4a;
        }

        .status.error {
          color: #9b2c2c;
        }

        .lyrics-scroll {
          max-height: min(52vh, 420px);
          overflow-y: auto;
          padding: 1.5rem 1.1rem 2.5rem;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--surface) 92%, #dce8f1) 0%,
            var(--surface) 100%
          );
          scroll-behavior: smooth;
        }

        :global(.lyrics-body) {
          line-height: 1.85;
          font-size: 1.25rem;
          font-family: var(--display);
          font-weight: 500;
          letter-spacing: -0.01em;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        :global(.lyrics-word) {
          display: inline;
          border-radius: 3px;
          padding: 0 1px;
          transition: color 0.18s ease, opacity 0.18s ease;
        }

        :global(.lyrics-word.future) {
          color: color-mix(in srgb, var(--mute) 70%, transparent);
          opacity: 0.75;
        }

        :global(.lyrics-word.spoken) {
          color: var(--ink);
        }

        :global(.lyrics-word.current) {
          color: var(--accent);
          font-weight: 650;
        }

        :global(.lyrics-word.chunk-a.spoken),
        :global(.lyrics-word.chunk-a.current) {
          color: #165a74;
        }

        :global(.lyrics-word.chunk-b.spoken),
        :global(.lyrics-word.chunk-b.current) {
          color: #3d5a80;
        }

        :global(.lyrics-word.seekable) {
          cursor: pointer;
        }

        :global(.lyrics-word.seekable:hover) {
          text-decoration: underline;
          text-underline-offset: 3px;
        }
      `}</style>
    </>
  );
}
