import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

function safeFileName(title: string): string {
  const base = String(title || "note")
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "note"}.pdf`;
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
  ].join(";");
  clone.style.width = `${width}px`;
  clone.style.boxSizing = "border-box";
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const surface =
      getComputedStyle(element).backgroundColor ||
      getComputedStyle(document.documentElement)
        .getPropertyValue("--surface")
        .trim() ||
      "#ffffff";

    const canvas = await html2canvas(clone, {
      scale: Math.min(3, window.devicePixelRatio > 1 ? 2.5 : 2),
      useCORS: true,
      allowTaint: true,
      backgroundColor: surface,
      logging: false,
      width,
      windowWidth: width,
      scrollX: 0,
      scrollY: 0,
      onclone: (_doc, cloned) => {
        // Re-assert overflow so multipage content is fully painted.
        cloned.style.height = "auto";
        cloned.style.maxHeight = "none";
        cloned.style.overflow = "visible";
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
