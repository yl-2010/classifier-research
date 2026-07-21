import type { PointerEvent as ReactPointerEvent } from "react";
import { THEME_PREFERENCES, type ThemePreference } from "../lib/theme";
import { useTheme } from "../lib/useTheme";

const PREFS: ThemePreference[] = THEME_PREFERENCES;

function MoonIcon() {
  return (
    <svg
      className="theme-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
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
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path
        fill="currentColor"
        d="M12 1.75a1 1 0 0 1 1 1V4a1 1 0 1 1-2 0V2.75a1 1 0 0 1 1-1Zm0 16.25a1 1 0 0 1 1 1v1.25a1 1 0 1 1-2 0V19a1 1 0 0 1 1-1ZM22.25 12a1 1 0 0 1-1 1H20a1 1 0 1 1 0-2h1.25a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H2.75a1 1 0 1 1 0-2H4a1 1 0 0 1 1 1Zm12.95-6.95a1 1 0 0 1 0 1.41l-.88.88a1 1 0 1 1-1.42-1.41l.88-.88a1 1 0 0 1 1.42 0ZM8.35 15.65a1 1 0 0 1 0 1.41l-.88.88a1 1 0 1 1-1.41-1.41l.88-.88a1 1 0 0 1 1.41 0ZM19.66 17.06a1 1 0 0 1-1.41 0l-.88-.88a1 1 0 0 1 1.41-1.41l.88.88a1 1 0 0 1 0 1.41ZM7.47 6.47a1 1 0 0 1-1.41 0l-.88-.88A1 1 0 0 1 6.6 3.76l.88.88a1 1 0 0 1 0 1.41Z"
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
      const ratio = (clientX - rect.left) / rect.width;
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
      target.releasePointerCapture(event.pointerId);
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
          gap: 0.45rem;
          color: var(--mute);
          flex-shrink: 0;
        }

        .theme-mode :global(.theme-icon) {
          display: block;
          opacity: 0.85;
        }

        .theme-slider {
          position: relative;
          width: 3.65rem;
          height: 1.45rem;
          border-radius: 999px;
          cursor: pointer;
          touch-action: none;
          outline: none;
          flex-shrink: 0;
        }

        .theme-slider:focus-visible {
          box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px #007aff;
        }

        .theme-slider-track {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
          overflow: hidden;
        }

        .theme-slider--dark .theme-slider-track {
          background: #1c1c1e;
        }

        .theme-slider--light .theme-slider-track {
          background: #f2f2f7;
        }

        .theme-slider--system .theme-slider-track {
          background: linear-gradient(
            to right,
            #f2f2f7 0%,
            #f2f2f7 50%,
            #1c1c1e 50%,
            #1c1c1e 100%
          );
        }

        .theme-slider-thumb {
          position: absolute;
          top: 50%;
          left: 0.12rem;
          width: 1.15rem;
          height: 1.15rem;
          border-radius: 50%;
          background: #007aff;
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.22),
            0 0 0 0.5px rgba(0, 122, 255, 0.35);
          transform: translateY(-50%);
          transition: left 0.18s ease;
          pointer-events: none;
        }

        .theme-slider--system .theme-slider-thumb {
          left: calc(50% - 0.575rem);
        }

        .theme-slider--light .theme-slider-thumb {
          left: calc(100% - 1.15rem - 0.12rem);
        }
      `}</style>
    </div>
  );
}
