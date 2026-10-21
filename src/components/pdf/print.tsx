import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, degrees, type PDFEmbeddedPage } from "@cantoo/pdf-lib";
import { Printer, Download } from "lucide-react";
import { toast } from "sonner";
import { Dropzone, FileChip, Field, Panel, Spinner, inputCls } from "./ui";
import { baseName, download, openPdf, parseRanges, readFile, renderPage, renderToDataUrl } from "@/lib/pdf";
import { buildSides, gridFor, splitManual, withCopies, type DuplexMode } from "@/lib/print";

const SIZES: Record<string, [number, number] | null> = {
  original: null, A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008], A3: [841.89, 1190.55], A5: [419.53, 595.28],
};

interface Opts {
  range: string; duplex: DuplexMode; flip: "long" | "short"; reverseBacks: boolean; nUp: number; booklet: boolean;
  reverse: boolean; copies: number; paper: string; orientation: "auto" | "portrait" | "landscape";
  scale: "fit" | "actual" | "custom"; customScale: number; margin: number; border: boolean; gray: boolean;
}

const DEFAULTS: Opts = {
  range: "", duplex: "manual", flip: "long", reverseBacks: false, nUp: 1, booklet: false, reverse: false, copies: 1,
  paper: "A4", orientation: "auto", scale: "fit", customScale: 100, margin: 18, border: false, gray: false,
};

async function toGrayscale(bytes: ArrayBuffer): Promise<Uint8Array> {
  const src = await openPdf(bytes);
  const out = await PDFDocument.create();
  for (let i = 1; i <= src.numPages; i++) {
    const c = document.createElement("canvas");
    const vp = await renderPage(src, i, c, 2);
    const ctx = c.getContext("2d")!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let j = 0; j < d.length; j += 4) { const g = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; d[j] = d[j + 1] = d[j + 2] = g; }
    ctx.putImageData(img, 0, 0);
    const jpg = await out.embedJpg(c.toDataURL("image/jpeg", 0.9));
    const w = vp.width / 2, h = vp.height / 2;
    out.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  return out.save();
}

/** Builds the print-ready PDF(s). Returns one PDF, or front/back PDFs for manual duplex. */
async function build(bytes: ArrayBuffer, o: Opts) {
  const srcBytes = o.gray ? await toGrayscale(bytes) : new Uint8Array(bytes);
  const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const pages = o.range.trim() ? parseRanges(o.range, total) : [...Array(total).keys()];
  if (!pages.length) throw new Error("No pages in that range");
  const nUp = o.booklet ? 2 : o.nUp;
  const duplex = o.duplex !== "single" || o.booklet;
  const sides = withCopies(buildSides({ pages, nUp, booklet: o.booklet, reverse: o.reverse }), o.copies, duplex, Array(nUp).fill(-1));
  const grid = gridFor(nUp);

  const first = src.getPage(pages[0]).getSize();
  let [pw, ph] = SIZES[o.paper] ?? [first.width, first.height];
  if (pw > ph) [pw, ph] = [ph, pw];
  const landscape = o.orientation === "auto" ? (nUp === 1 ? first.width > first.height : grid.landscape) : o.orientation === "landscape";
  if (landscape) [pw, ph] = [ph, pw];

  const make = async (list: number[][], flipBacks: boolean, backsStartOdd: boolean) => {
    const out = await PDFDocument.create();
    const cache = new Map<number, PDFEmbeddedPage>();
    const get = async (i: number) => {
      if (!cache.has(i)) cache.set(i, await out.embedPage(src.getPage(i)));
      return cache.get(i)!;
    };
    for (let s = 0; s < list.length; s++) {
      const page = out.addPage([pw, ph]);
      const cw = (pw - o.margin * 2) / grid.cols, ch = (ph - o.margin * 2) / grid.rows;
      for (let k = 0; k < list[s].length; k++) {
        const idx = list[s][k];
        if (idx < 0) continue;
        const ep = await get(idx);
        const col = k % grid.cols, row = Math.floor(k / grid.cols);
        const fit = Math.min(cw / ep.width, ch / ep.height);
        const sc = o.scale === "fit" ? fit : o.scale === "actual" ? Math.min(1, fit) : (fit * o.customScale) / 100;
        const w = ep.width * sc, h = ep.height * sc;
        const x = o.margin + col * cw + (cw - w) / 2;
        const y = ph - o.margin - (row + 1) * ch + (ch - h) / 2;
        page.drawPage(ep, { x, y, width: w, height: h });
        if (o.border) page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.5, borderOpacity: 0.6 });
      }
      // Short-edge flipping on a long-edge printer: rotate backs 180°.
      const isBack = backsStartOdd || s % 2 === 1;
      if (flipBacks && isBack) page.setRotation(degrees(180));
    }
    return out.save();
  };

  const shortFlip = o.flip === "short";
  if (o.duplex === "manual") {
    const { fronts, backs } = splitManual(sides, Array(nUp).fill(-1), o.reverseBacks);
    return { fronts: await make(fronts, false, false), backs: await make(backs, shortFlip, true), sheets: fronts.length };
  }
  return { all: await make(sides, false, false), sheets: duplex ? Math.ceil(sides.length / 2) : sides.length };
}

function printBytes(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  iframe.src = url;
  iframe.onload = () => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
    catch { window.open(url, "_blank"); }
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60_000);
  };
  document.body.appendChild(iframe);
}

type Result = Awaited<ReturnType<typeof build>>;

export function PrintTool() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [o, setO] = useState<Opts>(DEFAULTS);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [step, setStep] = useState<0 | 1>(0);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((p) => ({ ...p, [k]: v }));
  const job = useRef(0);

  useEffect(() => {
    if (!bytes) return;
    const id = ++job.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await build(bytes, o);
        if (id !== job.current) return;
        setRes(r); setStep(0);
        const preview = "all" in r ? r.all! : r.fronts!;
        const doc = await openPdf(preview);
        const urls: string[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, 12); i++) urls.push(await renderToDataUrl(doc, i, 0.3));
        if (id === job.current) setThumbs(urls);
      } catch (e) {
        if (id === job.current) toast.error((e as Error).message);
      } finally { if (id === job.current) setBusy(false); }
    }, o.gray ? 400 : 150);
    return () => clearTimeout(t);
  }, [bytes, o]);

  const manual = res && "fronts" in res;
  const name = file ? baseName(file.name) : "document";
  const summary = useMemo(() => {
    if (!res) return "";
    return `${res.sheets} sheet${res.sheets === 1 ? "" : "s"} of paper`;
  }, [res]);

  if (!file) {
    return <Dropzone onFiles={async ([f]) => { setFile(f); setBytes(await readFile(f)); }} label="Drop a PDF to print" />;
  }

  const seg = (v: string, cur: string, on: () => void, label: string) => (
    <button key={v} onClick={on} className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${cur === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <FileChip name={file.name} onRemove={() => { setFile(null); setBytes(null); setRes(null); setThumbs([]); }} />
        <Panel>
          <Field label="Sides">
            <div className="flex gap-1 rounded-lg border p-1">
              {seg("single", o.duplex, () => set("duplex", "single"), "One side")}
              {seg("manual", o.duplex, () => set("duplex", "manual"), "Both (manual)")}
              {seg("auto", o.duplex, () => set("duplex", "auto"), "Both (printer)")}
            </div>
          </Field>
          {o.duplex === "manual" && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Page 1 on the front, page 2 on the back, page 3 on the next sheet's front, and so on. You print the fronts, put the stack back in the tray, then print the backs.
            </p>
          )}
          {o.duplex === "auto" && <p className="text-[11px] text-muted-foreground">Choose "Print on both sides" in the print window that opens.</p>}
          {o.duplex !== "single" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Flip on">
                <select className={inputCls} value={o.flip} onChange={(e) => set("flip", e.target.value as Opts["flip"])}>
                  <option value="long">Long edge</option><option value="short">Short edge</option>
                </select>
              </Field>
              {o.duplex === "manual" && (
                <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={o.reverseBacks} onChange={(e) => set("reverseBacks", e.target.checked)} /> Backs in reverse</label>
              )}
            </div>
          )}
        </Panel>
        <Panel>
          <Field label="Pages" hint="e.g. 1-5, 8, 11-  (empty = all)"><input className={inputCls} value={o.range} onChange={(e) => set("range", e.target.value)} placeholder="All pages" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Copies"><input type="number" min={1} max={99} className={inputCls} value={o.copies} onChange={(e) => set("copies", Math.max(1, Math.min(99, +e.target.value || 1)))} /></Field>
            <Field label="Pages per sheet">
              <select className={inputCls} value={o.booklet ? 2 : o.nUp} disabled={o.booklet} onChange={(e) => set("nUp", +e.target.value)}>
                {[1, 2, 4, 6, 9, 16].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.booklet} onChange={(e) => setO((p) => ({ ...p, booklet: e.target.checked, duplex: e.target.checked && p.duplex === "single" ? "manual" : p.duplex }))} /> Booklet (fold in half, staple in middle)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.reverse} disabled={o.booklet} onChange={(e) => set("reverse", e.target.checked)} /> Reverse page order</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.gray} onChange={(e) => set("gray", e.target.checked)} /> Black & white (saves ink)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.border} onChange={(e) => set("border", e.target.checked)} /> Border around pages</label>
          </div>
        </Panel>
        <Panel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paper">
              <select className={inputCls} value={o.paper} onChange={(e) => set("paper", e.target.value)}>
                {Object.keys(SIZES).map((k) => <option key={k} value={k}>{k === "original" ? "Same as PDF" : k}</option>)}
              </select>
            </Field>
            <Field label="Orientation">
              <select className={inputCls} value={o.orientation} onChange={(e) => set("orientation", e.target.value as Opts["orientation"])}>
                <option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </select>
            </Field>
            <Field label="Scale">
              <select className={inputCls} value={o.scale} onChange={(e) => set("scale", e.target.value as Opts["scale"])}>
                <option value="fit">Fit to paper</option><option value="actual">Actual size</option><option value="custom">Custom %</option>
              </select>
            </Field>
            {o.scale === "custom" ? (
              <Field label="Scale %"><input type="number" min={10} max={100} className={inputCls} value={o.customScale} onChange={(e) => set("customScale", Math.max(10, Math.min(100, +e.target.value || 100)))} /></Field>
            ) : (
              <Field label="Margin (pt)"><input type="number" min={0} max={72} className={inputCls} value={o.margin} onChange={(e) => set("margin", Math.max(0, Math.min(72, +e.target.value || 0)))} /></Field>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">{busy && <Spinner />}{summary}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {manual ? (
              <>
                <button disabled={busy} onClick={() => { printBytes(res.fronts!); setStep(1); }} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${step === 0 ? "bg-foreground text-background" : "border"}`}><Printer className="size-4" /> 1. Print fronts</button>
                <button disabled={busy} onClick={() => printBytes(res.backs!)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${step === 1 ? "bg-foreground text-background" : "border"}`}><Printer className="size-4" /> 2. Print backs</button>
                <button disabled={busy} onClick={() => { download(res.fronts!, `${name}-fronts.pdf`); download(res.backs!, `${name}-backs.pdf`); }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="size-4" /> Save</button>
              </>
            ) : res && "all" in res ? (
              <>
                <button disabled={busy} onClick={() => printBytes(res.all!)} className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm text-background"><Printer className="size-4" /> Print</button>
                <button disabled={busy} onClick={() => download(res.all!, `${name}-print.pdf`)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="size-4" /> Save</button>
              </>
            ) : null}
          </div>
        </div>
        {manual && step === 1 && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            When the fronts finish, put the printed stack back into the tray without changing its order{o.reverseBacks ? " (the backs come out in reverse)" : ""}, then press "2. Print backs". Do a test with 2 sheets first if you're unsure which way your printer feeds.
          </p>
        )}
        <div>
          <p className="mb-2 text-xs text-muted-foreground">{manual ? "Front sides preview" : "Print preview"}{thumbs.length >= 12 ? " (first 12 sheets)" : ""}</p>
          <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 transition-opacity ${busy ? "opacity-60" : ""}`}>
            {thumbs.map((u, i) => (
              <figure key={i} className="space-y-1">
                <img src={u} alt={`Sheet ${i + 1}`} className="w-full rounded border bg-white page-shadow" />
                <figcaption className="text-center text-[11px] text-muted-foreground">Sheet {i + 1}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
