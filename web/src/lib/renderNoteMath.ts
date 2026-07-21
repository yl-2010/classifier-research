import renderMathInElement from "katex/contrib/auto-render";

const MATH_OPTIONS = {
  delimiters: [
    { left: "\\[", right: "\\]", display: true },
    { left: "\\(", right: "\\)", display: false },
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
  ],
  throwOnError: false,
  strict: "ignore" as const,
};

/** Typeset LaTeX inside a note HTML host (\[ \], \( \), $$, $). */
export function renderNoteMath(el: HTMLElement | null) {
  if (!el) return;
  renderMathInElement(el, MATH_OPTIONS);
}
