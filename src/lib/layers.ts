// Watermark/stamp layers: rendered live as SVG over the preview, then written into the PDF on apply.
import { PDFDocument, PDFString, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";
import { hexToRgb01, parseRanges } from "./pdf";

export type LayerKind = "text" | "image" | "link";
export interface Layer {
  id: string;
  kind: LayerKind;
  text: string;      // text content, or link label
  url: string;       // link target
  img?: { dataUrl: string; bytes: Uint8Array; aspect: number }; // aspect = h / w
  size: number;      // text font size, or image width, in PDF points
  opacity: number;   // 0..1
  angle: number;     // degrees, counter-clockwise
  color: string;
  x: number;         // center, fraction of page width
  y: number;         // center, fraction of page height from top
  tile: boolean;
  pages: string;     // "" = all pages, else ranges like "1-3, 5"
}

export const newLayer = (kind: LayerKind, extra: Partial<Layer> = {}): Layer => ({
  id: crypto.randomUUID(), kind,
  text: kind === "text" ? "CONFIDENTIAL" : kind === "link" ? "Visit link" : "",
  url: "https://", size: kind === "text" ? 48 : kind === "link" ? 14 : 160,
  opacity: kind === "link" ? 1 : 0.25, angle: kind === "text" ? 45 : 0, color: "#000000",
  x: 0.5, y: kind === "link" ? 0.92 : 0.5, tile: false, pages: "", ...extra,
});

/** Approximate Helvetica-Bold width so the live preview matches the PDF output closely. */
export const approxTextWidth = (t: string, size: number) => t.length * size * 0.6;

export const layerAppliesTo = (l: Layer, pageIdx: number, total: number) =>
  !l.pages.trim() || parseRanges(l.pages, total).includes(pageIdx);

/** Tile centers in page coordinates (top-left origin) for a layer. */
export function tilePositions(l: Layer, pw: number, ph: number, itemW: number, itemH: number) {
  if (!l.tile) return [[l.x * pw, l.y * ph]];
  const step = Math.max(itemW, itemH, 40) * 1.4;
  const out: number[][] = [];
  for (let y = step / 2; y < ph + step; y += step) for (let x = step / 2; x < pw + step; x += step) out.push([x, y]);
  return out;
}

export async function imageFileToLayerImg(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    return { dataUrl: c.toDataURL("image/png"), bytes: new Uint8Array(await blob.arrayBuffer()), aspect: img.naturalHeight / img.naturalWidth };
  } finally { URL.revokeObjectURL(url); }
}

const rot = (dx: number, dy: number, a: number) => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];

export async function applyLayers(doc: PDFDocument, layers: Layer[]) {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const l of layers) if (l.img) images.set(l.id, await doc.embedPng(l.img.bytes));
  const pages = doc.getPages();
  pages.forEach((page, pi) => {
    const { width: pw, height: ph } = page.getSize();
    for (const l of layers) {
      if (!layerAppliesTo(l, pi, pages.length)) continue;
      const c = hexToRgb01(l.color);
      const a = (l.angle * Math.PI) / 180;
      if (l.kind === "text") {
        if (!l.text.trim()) continue;
        const tw = font.widthOfTextAtSize(l.text, l.size);
        const th = font.heightAtSize(l.size, { descender: false });
        for (const [cx, cyTop] of tilePositions(l, pw, ph, tw, l.size)) {
          const [ox, oy] = rot(-tw / 2, -th / 2, a);
          page.drawText(l.text, { x: cx + ox, y: ph - cyTop + oy, size: l.size, font, color: rgb(c.r, c.g, c.b), opacity: l.opacity, rotate: degrees(l.angle) });
        }
      } else if (l.kind === "image") {
        const img = images.get(l.id); if (!img) continue;
        const w = l.size, h = l.size * l.img!.aspect;
        for (const [cx, cyTop] of tilePositions(l, pw, ph, w, h)) {
          const [ox, oy] = rot(-w / 2, -h / 2, a);
          page.drawImage(img, { x: cx + ox, y: ph - cyTop + oy, width: w, height: h, opacity: l.opacity, rotate: degrees(l.angle) });
        }
      } else {
        // Link: optional icon + label, with a clickable URI annotation over the whole box.
        const img = images.get(l.id);
        const s = l.size;
        const iconW = img ? s * 1.4 : 0;
        const gap = img && l.text ? s * 0.4 : 0;
        const tw = l.text ? font.widthOfTextAtSize(l.text, s) : 0;
        const boxW = iconW + gap + tw, boxH = s * 1.4;
        const left = l.x * pw - boxW / 2, bottom = ph - l.y * ph - boxH / 2;
        if (img) page.drawImage(img, { x: left, y: bottom + (boxH - iconW * l.img!.aspect) / 2, width: iconW, height: iconW * l.img!.aspect, opacity: l.opacity });
        if (l.text) page.drawText(l.text, { x: left + iconW + gap, y: bottom + boxH / 2 - font.heightAtSize(s, { descender: false }) / 2, size: s, font, color: rgb(c.r, c.g, c.b), opacity: l.opacity });
        if (l.url && l.url !== "https://") {
          const annot = doc.context.register(doc.context.obj({
            Type: "Annot", Subtype: "Link", Rect: [left, bottom, left + boxW, bottom + boxH], Border: [0, 0, 0],
            A: { Type: "Action", S: "URI", URI: PDFString.of(l.url) },
          }));
          page.node.addAnnot(annot);
        }
      }
    }
  });
}
