import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const PDF_WHITE = "#ffffff";
const PDF_INK = "#0b1f33";
const PDF_ACCENT_FALLBACK = "#1a6b8a";

function safeFileName(title: string): string {
  const base = String(title || "note")
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "note"}.pdf`;
}

function parseCssColor(
  color: string
): { r: number; g: number; b: number; a: number } | null {
  const value = String(color || "").trim();
  if (!value || value === "transparent") return null;

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  const m = value.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
  );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function toCssRgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Prefer --subj; fall back to the inset accent color from box-shadow. */
function resolveAccentColor(source: HTMLElement, clone: HTMLElement): string {
  const fromVar = getComputedStyle(source).getPropertyValue("--subj").trim();
  if (fromVar) {
    const parsed = parseCssColor(fromVar);
    if (parsed) return toCssRgb(parsed.r, parsed.g, parsed.b);
    if (fromVar.startsWith("#") || fromVar.startsWith("rgb")) return fromVar;
  }

  const shadow = clone.style.boxShadow || getComputedStyle(source).boxShadow;
  const shadowColor = String(shadow || "").match(
    /rgba?\([^)]+\)|#[0-9a-f]{3,8}/i
  );
  if (shadowColor?.[0]) {
    const parsed = parseCssColor(shadowColor[0]);
    if (parsed) return toCssRgb(parsed.r, parsed.g, parsed.b);
    return shadowColor[0];
  }

  return PDF_ACCENT_FALLBACK;
}

/** Copy resolved computed styles so html2canvas keeps fonts, KaTeX, layout, etc. */
function inlineComputedStyles(sourceRoot: HTMLElement, targetRoot: HTMLElement) {
  const sourceNodes = [
    sourceRoot,
    ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*")),
  ];
  const targetNodes = [
    targetRoot,
    ...Array.from(targetRoot.querySelectorAll<HTMLElement>("*")),
  ];

  const count = Math.min(sourceNodes.length, targetNodes.length);
  for (let i = 0; i < count; i++) {
    const source = sourceNodes[i];
    const target = targetNodes[i];
    if (!source || !target) continue;

    const computed = window.getComputedStyle(source);
    let cssText = "";
    for (let j = 0; j < computed.length; j++) {
      const prop = computed.item(j);
      if (!prop) continue;
      // Skip shadows — html2canvas paints inset box-shadow as a full fill.
      if (prop === "box-shadow" || prop === "text-shadow") continue;
      cssText += `${prop}:${computed.getPropertyValue(prop)};`;
    }
    target.style.cssText = cssText;

    if (i === 0) {
      target.style.height = "auto";
      target.style.maxHeight = "none";
      target.style.overflow = "visible";
    }
  }
}

/**
 * Force a true white page. Keep only a thin subject-colored top border as accent
 * (inset box-shadow is avoided — html2canvas fills the whole card with it).
 */
function forceWhitePdfSurface(root: HTMLElement, accentColor: string) {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

  for (const el of nodes) {
    el.style.boxShadow = "none";
    el.style.backgroundImage = "none";

    // Always clear fills; light structure/typography stays via color/font/etc.
    const bg = parseCssColor(el.style.backgroundColor);
    const isRoot = el === root;
    if (isRoot) {
      el.style.background = PDF_WHITE;
      el.style.backgroundColor = PDF_WHITE;
    } else if (!bg || bg.a < 0.05 || relativeLuminance(bg.r, bg.g, bg.b) < 0.85) {
      // Drop dark/tinted card fills and mid eq tints that muddy a white page.
      // Keep only near-white backgrounds if any.
      if (!bg || relativeLuminance(bg.r, bg.g, bg.b) < 0.92) {
        el.style.background = "transparent";
        el.style.backgroundColor = "transparent";
      }
    }

    const fg = parseCssColor(el.style.color);
    if (fg && relativeLuminance(fg.r, fg.g, fg.b) > 0.55) {
      el.style.color = PDF_INK;
    }
  }

  root.style.background = PDF_WHITE;
  root.style.backgroundColor = PDF_WHITE;
  root.style.backgroundImage = "none";
  root.style.color = PDF_INK;
  root.style.boxShadow = "none";
  root.style.borderTop = `3px solid ${accentColor}`;
  root.style.borderTopLeftRadius = "0";
  root.style.borderTopRightRadius = "0";
}

/**
 * Capture a note DOM node (with visible HTML/KaTeX formatting) and download
 * a multipage A4 PDF on a white page.
 */
export async function exportNotePdf(
  element: HTMLElement,
  title: string
): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const width = Math.max(element.scrollWidth, element.clientWidth, 320);
  const clone = element.cloneNode(true) as HTMLElement;
  inlineComputedStyles(element, clone);
  const accentColor = resolveAccentColor(element, clone);
  forceWhitePdfSurface(clone, accentColor);

  const host = document.createElement("div");
  host.setAttribute("data-notelms-pdf-export", "1");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${width}px`,
    "margin:0",
    "padding:0",
    "pointer-events:none",
    "z-index:-1",
    `background:${PDF_WHITE}`,
  ].join(";");
  clone.style.width = `${width}px`;
  clone.style.boxSizing = "border-box";
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(clone, {
      scale: Math.min(3, window.devicePixelRatio > 1 ? 2.5 : 2),
      useCORS: true,
      allowTaint: true,
      backgroundColor: PDF_WHITE,
      logging: false,
      width,
      windowWidth: width,
      scrollX: 0,
      scrollY: 0,
      onclone: (_doc, cloned) => {
        cloned.style.height = "auto";
        cloned.style.maxHeight = "none";
        cloned.style.overflow = "visible";
        cloned.style.background = PDF_WHITE;
        cloned.style.backgroundColor = PDF_WHITE;
        cloned.style.backgroundImage = "none";
        cloned.style.boxShadow = "none";
        if (!cloned.style.borderTop) {
          cloned.style.borderTop = `3px solid ${accentColor}`;
        }
      },
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;

    while (heightLeft > 1) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= usableHeight;
    }

    pdf.save(safeFileName(title));
  } finally {
    host.remove();
  }
}
