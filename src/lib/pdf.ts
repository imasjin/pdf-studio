// Browser-only PDF helpers. Everything runs locally; files never leave the device.
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export async function openPdf(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  return pdfjs.getDocument({ data }).promise;
}

export async function renderPage(
  doc: PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale = 1.5,
) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  // Render offscreen first so concurrent renders (e.g. React strict mode) never share a canvas.
  const tmp = document.createElement("canvas");
  tmp.width = Math.floor(viewport.width);
  tmp.height = Math.floor(viewport.height);
  await page.render({ canvasContext: tmp.getContext("2d")!, viewport, canvas: tmp } as never).promise;
  canvas.width = tmp.width;
  canvas.height = tmp.height;
  canvas.getContext("2d")!.drawImage(tmp, 0, 0);
  return viewport;
}

export async function renderToDataUrl(doc: PDFDocumentProxy, pageNum: number, scale = 0.4) {
  const c = document.createElement("canvas");
  await renderPage(doc, pageNum, c, scale);
  return c.toDataURL("image/jpeg", 0.8);
}

export function readFile(file: File) {
  return file.arrayBuffer();
}

export function download(data: Uint8Array | Blob, name: string, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

/** Parse "1-3, 5, 8-" into zero-based indices within [0, total). */
export function parseRanges(input: string, total: number): number[] {
  const out: number[] = [];
  for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? parseInt(m[1]) : 1;
      const b = m[2] ? parseInt(m[2]) : total;
      for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.push(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part);
      if (n >= 1 && n <= total) out.push(n - 1);
    }
  }
  return out;
}

export function hexToRgb01(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
