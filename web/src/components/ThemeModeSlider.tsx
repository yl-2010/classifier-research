import type { PointerEvent as ReactPointerEvent } from "react";
import { THEME_PREFERENCES, type ThemePreference } from "../lib/theme";
import { useTheme } from "../lib/useTheme";

const PREFS: ThemePreference[] = THEME_PREFERENCES;

function MoonIcon() {
  return (
    <svg
      className="theme-icon"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12.1 2.2a1 1 0 0 1 .96 1.28 7.5 7.5 0 1 0 7.46 7.46 1 1 0 0 1 1.28.96A9.5 9.5 0 1 1 12.1 2.2Z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      className="theme-icon"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3.75" fill="currentColor" />
      <path
        fill="currentColor"
        d="M12 1.9a.85.85 0 0 1 .85.85V4a.85.85 0 1 1-1.7 0V2.75A.85.85 0 0 1 12 1.9Zm0 16.2a.85.85 0 0 1 .85.85v1.25a.85.85 0 1 1-1.7 0V19a.85.85 0 0 1 .85-.9ZM22.1 12a.85.85 0 0 1-.85.85H19.95a.85.85 0 1 1 0-1.7H21.25A.85.85 0 0 1 22.1 12ZM5.05 12a.85.85 0 0 1-.85.85H2.95a.85.85 0 1 1 0-1.7H4.2A.85.85 0 0 1 5.05 12Zm12.72-6.72a.85.85 0 0 1 0 1.2l-.88.88a.85.85 0 1 1-1.2-1.2l.88-.88a.85.85 0 0 1 1.2 0ZM8.31 15.69a.85.85 0 0 1 0 1.2l-.88.88a.85.85 0 1 1-1.2-1.2l.88-.88a.85.85 0 0 1 1.2 0Zm10.58 1.2a.85.85 0 0 1-1.2 0l-.88-.88a.85.85 0 0 1 1.2-1.2l.88.88a.85.85 0 0 1 0 1.2ZM7.51 6.51a.85.85 0 0 1-1.2 0l-.88-.88a.85.85 0 1 1 1.2-1.2l.88.88a.85.85 0 0 1 0 1.2Z"
      />
    </svg>
  );
}

export function ThemeModeSlider() {
  const { preference, setTheme } = useTheme();
  const index = Math.max(0, PREFS.indexOf(preference));

  const label =
    preference === "dark"
      ? "Dark mode"
      : preference === "light"
        ? "Light mode"
        : "System theme";

  const nudge = (delta: number) => {
    const next = Math.min(2, Math.max(0, index + delta));
    setTheme(PREFS[next]);
  };

  const onTrackPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const pick = (clientX: number) => {
      const rect = target.getBoundingClientRect();
      const ratio = (clientX - rect.left) / Math.max(rect.width, 1);
      if (ratio < 1 / 3) setTheme("dark");
      else if (ratio < 2 / 3) setTheme("system");
      else setTheme("light");
    };

    pick(event.clientX);
    target.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      pick(moveEvent.clientX);
    };
    const onUp = () => {
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  return (
    <div className="theme-mode">
      <MoonIcon />
      <div
        className={`theme-slider theme-slider--${preference}`}
        role="slider"
        tabIndex={0}
        aria-label="Color theme"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={index}
        aria-valuetext={label}
        onPointerDown={onTrackPointer}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            nudge(-1);
          } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            nudge(1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setTheme("dark");
          } else if (event.key === "End") {
            event.preventDefault();
            setTheme("light");
          }
        }}
      >
        <span className="theme-slider-track" aria-hidden="true" />
        <span className="theme-slider-thumb" aria-hidden="true" />
      </div>
      <SunIcon />
      <style jsx>{`
        .theme-mode {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--mute);
          flex-shrink: 0;
        }

        .theme-mode :global(.theme-icon) {
          display: block;
          flex-shrink: 0;
          opacity: 0.9;
        }

        .theme-slider {
          --slider-w: 3.75rem;
          --slider-h: 1.5rem;
          --thumb: 1.2rem;
          --pad: 0.15rem;
          --track-light: #f4f7fa;
          --track-dark: #0b1622;

          position: relative;
          width: var(--slider-w);
          height: var(--slider-h);
          border-radius: 999px;
          overflow: hidden;
          isolation: isolate;
          cursor: pointer;
          touch-action: none;
          outline: none;
          flex-shrink: 0;
          /* Inset ring instead of border — avoids jagged anti-alias at the pill edge */
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent);
        }

        .theme-slider:focus-visible {
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent),
            0 0 0 2px var(--bg),
            0 0 0 4px var(--accent);
        }

        .theme-slider-track {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          transition: background 0.18s ease;
        }

        .theme-slider--dark .theme-slider-track {
          background: var(--track-dark);
        }

        .theme-slider--light .theme-slider-track {
          background: var(--track-light);
        }

        .theme-slider--system .theme-slider-track {
          background: linear-gradient(
            90deg,
            var(--track-dark) 0%,
            var(--track-dark) 28%,
            color-mix(in srgb, var(--track-light) 55%, var(--track-dark)) 50%,
            var(--track-light) 72%,
            var(--track-light) 100%
          );
        }

        .theme-slider-thumb {
          position: absolute;
          top: 50%;
          left: var(--pad);
          z-index: 1;
          width: var(--thumb);
          height: var(--thumb);
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 1px 2px rgba(11, 31, 51, 0.28);
          transform: translate3d(0, -50%, 0);
          transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
        }

        .theme-slider--system .theme-slider-thumb {
          transform: translate3d(
            calc((var(--slider-w) - var(--thumb)) / 2 - var(--pad)),
            -50%,
            0
          );
        }

        .theme-slider--light .theme-slider-thumb {
          transform: translate3d(
            calc(var(--slider-w) - var(--thumb) - var(--pad) * 2),
            -50%,
            0
          );
        }
      `}</style>
    </div>
  );
}
