import { FormEvent, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import { notelmsFetch, useNotelmsRuntimeConfig } from "@/lib/notelmsApi";
import { useUiContext } from "@/lib/uiContext";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function NotesChat() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const { apiBase } = useNotelmsRuntimeConfig();
  const { ui } = useUiContext();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  if (!signedIn) return null;

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy || !apiBase) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const res = await notelmsFetch(apiBase, "/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: nextMessages,
          uiContext: {
            page: ui.page,
            subject: ui.subject || undefined,
            noteId: ui.noteId || undefined,
            noteTitle: ui.noteTitle || undefined,
            noteText: ui.noteText || undefined,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        content?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Chat failed (${res.status})`);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: String(data.content || "").trim() || "…" },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="notes-chat">
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Chat">
          <div className="chat-bar">
            <button
              type="button"
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>
          <div className="chat-list" ref={listRef}>
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}
              >
                {m.role === "assistant" ? (
                  <div className="chat-md">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            ))}
            {busy && <div className="chat-bubble bot muted">…</div>}
            {error && <p className="chat-error">{error}</p>}
          </div>
          <form className="chat-form" onSubmit={(e) => void send(e)}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your notes"
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !input.trim() || !apiBase}>
              Send
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        className="chat-fab"
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "×" : "Chat"}
      </button>
      <style jsx>{`
        .notes-chat {
          position: fixed;
          right: 1rem;
          bottom: 1rem;
          z-index: 80;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.65rem;
        }

        .chat-fab {
          border: 0;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.95rem;
          padding: 0.85rem 1.15rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
          box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 18%, transparent);
        }

        .chat-panel {
          display: flex;
          flex-direction: column;
          width: min(92vw, 100%);
          height: 66vh;
          background: var(--surface);
          color: var(--ink);
          border-radius: var(--radius);
          box-shadow: 0 16px 48px color-mix(in srgb, var(--ink) 22%, transparent);
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
        }

        @media (min-width: 900px) {
          .chat-panel {
            width: 25vw;
            min-width: 280px;
            max-width: 380px;
            height: 50vh;
          }
        }

        .chat-bar {
          display: flex;
          justify-content: flex-end;
          padding: 0.35rem 0.45rem 0;
        }

        .chat-close {
          border: 0;
          background: transparent;
          color: var(--mute);
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
          padding: 0.2rem 0.45rem;
        }

        .chat-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 0.85rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .chat-bubble {
          max-width: 92%;
          padding: 0.55rem 0.7rem;
          border-radius: var(--radius);
          font-size: 0.9rem;
          line-height: 1.45;
          word-break: break-word;
        }

        .chat-bubble.user {
          align-self: flex-end;
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          white-space: pre-wrap;
        }

        .chat-bubble.bot {
          align-self: flex-start;
          background: color-mix(in srgb, var(--ink) 6%, transparent);
        }

        .chat-bubble.muted {
          color: var(--mute);
        }

        .chat-md :global(p) {
          margin: 0 0 0.55em;
        }

        .chat-md :global(p:last-child) {
          margin-bottom: 0;
        }

        .chat-md :global(strong) {
          font-weight: 700;
        }

        .chat-md :global(em) {
          font-style: italic;
        }

        .chat-md :global(ul),
        .chat-md :global(ol) {
          margin: 0.35em 0 0.55em;
          padding-left: 1.25em;
        }

        .chat-md :global(ul:last-child),
        .chat-md :global(ol:last-child) {
          margin-bottom: 0;
        }

        .chat-md :global(li) {
          margin: 0.2em 0;
        }

        .chat-md :global(li > p) {
          margin: 0;
        }

        .chat-md :global(h1),
        .chat-md :global(h2),
        .chat-md :global(h3),
        .chat-md :global(h4) {
          margin: 0.45em 0 0.35em;
          font-size: 1em;
          font-weight: 700;
          line-height: 1.35;
        }

        .chat-md :global(h1:first-child),
        .chat-md :global(h2:first-child),
        .chat-md :global(h3:first-child),
        .chat-md :global(h4:first-child) {
          margin-top: 0;
        }

        .chat-md :global(code) {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
          font-size: 0.86em;
          padding: 0.1em 0.3em;
          border-radius: 0.25em;
          background: color-mix(in srgb, var(--ink) 8%, transparent);
        }

        .chat-md :global(pre) {
          margin: 0.45em 0;
          padding: 0.55em 0.65em;
          overflow-x: auto;
          border-radius: 0.35em;
          background: color-mix(in srgb, var(--ink) 8%, transparent);
        }

        .chat-md :global(pre code) {
          padding: 0;
          background: transparent;
        }

        .chat-md :global(a) {
          color: var(--accent);
        }

        .chat-error {
          margin: 0;
          color: #9b2c2c;
          font-size: 0.8rem;
        }

        .chat-form {
          display: flex;
          gap: 0.4rem;
          padding: 0.65rem 0.75rem 0.75rem;
          border-top: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
        }

        .chat-form input {
          flex: 1;
          border: 0;
          background: color-mix(in srgb, var(--ink) 5%, transparent);
          color: var(--ink);
          padding: 0.55rem 0.65rem;
          border-radius: var(--radius);
          font: inherit;
        }

        .chat-form input:focus {
          outline: none;
          box-shadow: 0 0 0 2px
            color-mix(in srgb, var(--accent) 28%, transparent);
        }

        .chat-form button {
          border: 0;
          cursor: pointer;
          font-weight: 600;
          padding: 0.55rem 0.85rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
        }

        .chat-form button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
