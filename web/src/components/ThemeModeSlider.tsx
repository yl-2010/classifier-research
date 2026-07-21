import type { PointerEvent as ReactPointerEvent } from "react";
import { THEME_PREFERENCES, type ThemePreference } from "../lib/theme";
import { useTheme } from "../lib/useTheme";

const PREFS: ThemePreference[] = THEME_PREFERENCES;

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
    const thumb = target.querySelector(".theme-slider-thumb");
    const thumbRect = thumb?.getBoundingClientRect();
    const hitThumb =
      !!thumbRect &&
      event.clientX >= thumbRect.left &&
      event.clientX <= thumbRect.right &&
      event.clientY >= thumbRect.top &&
      event.clientY <= thumbRect.bottom;

    // Clicking the thumb: light ↔ dark, system → light.
    if (hitThumb) {
      setTheme(preference === "light" ? "dark" : "light");
      return;
    }

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
      <span className="theme-label">Theme</span>
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
      <style jsx>{`
        .theme-mode {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: var(--mute);
          flex-shrink: 0;
        }

        .theme-label {
          font-size: 0.8rem;
          letter-spacing: 0.01em;
          line-height: 1;
          user-select: none;
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
          /* Inset ring + outer glow so the pill reads on both page themes.
             --ink is dark in light mode and light in dark mode. */
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent),
            0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent),
            0 0 7px color-mix(in srgb, var(--ink) 22%, transparent);
        }

        .theme-slider:focus-visible {
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent),
            0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent),
            0 0 7px color-mix(in srgb, var(--ink) 22%, transparent),
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
            var(--track-dark) 41.2%,
            color-mix(in srgb, var(--track-light) 55%, var(--track-dark)) 50%,
            var(--track-light) 58.8%,
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
