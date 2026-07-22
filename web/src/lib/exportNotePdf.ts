import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const PDF_WHITE = "#ffffff";
const PDF_INK = "#0b1f33";

function safeFileName(title: string): string {
  const base = String(title || "note")
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "note"}.pdf`;
}

function parseRgb(
  color: string
): { r: number; g: number; b: number; a: number } | null {
  const value = String(color || "").trim();
  if (!value || value === "transparent") return null;
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

/** Copy resolved computed styles so html2canvas keeps fonts, KaTeX, colors, etc. */
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
      cssText += `${prop}:${computed.getPropertyValue(prop)};`;
    }
    target.style.cssText = cssText;

    // Avoid clipping tall notes when the live element is inside a scroll area.
    if (i === 0) {
      target.style.height = "auto";
      target.style.maxHeight = "none";
      target.style.overflow = "visible";
    }
  }
}

/**
 * Force a white page while keeping structure/typography and the subject accent bar.
 * Dark-theme fills/text from inlined styles are neutralized for print.
 */
function forceWhitePdfSurface(root: HTMLElement) {
  const accentOutline = root.style.boxShadow;
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

  for (const el of nodes) {
    const bg = parseRgb(el.style.backgroundColor);
    if (bg && bg.a > 0.05 && relativeLuminance(bg.r, bg.g, bg.b) < 0.55) {
      el.style.backgroundColor = el === root ? PDF_WHITE : "transparent";
    }

    const fg = parseRgb(el.style.color);
    if (fg && relativeLuminance(fg.r, fg.g, fg.b) > 0.62) {
      el.style.color = PDF_INK;
    }

    const border = parseRgb(el.style.borderColor);
    if (border && relativeLuminance(border.r, border.g, border.b) > 0.7) {
      el.style.borderColor = "rgba(11, 31, 51, 0.18)";
    }
  }

  root.style.backgroundColor = PDF_WHITE;
  root.style.color = PDF_INK;
  if (accentOutline && accentOutline !== "none") {
    root.style.boxShadow = accentOutline;
  }
}

/**
 * Capture a note DOM node (with visible HTML/KaTeX formatting) and download
 * a multipage A4 PDF.
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
  forceWhitePdfSurface(clone);

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
        cloned.style.backgroundColor = PDF_WHITE;
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
