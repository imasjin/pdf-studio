import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Dropzone, FileChip, Spinner } from "./ui";
import { openPdf, renderPage } from "@/lib/pdf";

type Mode = "side" | "diff";

export function CompareTool() {
  const [a, setA] = useState<{ file: File; doc: PDFDocumentProxy } | null>(null);
  const [b, setB] = useState<{ file: File; doc: PDFDocumentProxy } | null>(null);
  const [mode, setMode] = useState<Mode>("side");
  const [sync, setSync] = useState(true);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const lock = useRef(false);

  const pick = async (f: File, set: typeof setA) => set({ file: f, doc: await openPdf(await f.arrayBuffer()) });

  const onScroll = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!sync || !from || !to || lock.current) return;
    lock.current = true;
    const r = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    to.scrollTop = r * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => (lock.current = false));
  };

  if (!a || !b) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {a ? <FileChip name={a.file.name} onRemove={() => setA(null)} /> : <Dropzone label="Original document" onFiles={(f) => pick(f[0], setA)} />}
        {b ? <FileChip name={b.file.name} onRemove={() => setB(null)} /> : <Dropzone label="Revised document" onFiles={(f) => pick(f[0], setB)} />}
      </div>
    );
  }

  const pages = Math.max(a.doc.numPages, b.doc.numPages);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
          {(["side", "diff"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-3 py-1.5 transition ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {m === "side" ? "Side by side" : "Highlight differences"}
            </button>
          ))}
        </div>
        {mode === "side" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="accent-foreground" /> Sync scroll</label>}
        <button onClick={() => { setA(null); setB(null); }} className="ml-auto text-sm text-muted-foreground hover:text-foreground">Start over</button>
      </div>

      {mode === "side" ? (
        <div className="grid h-[75vh] grid-cols-2 gap-3">
          {[{ d: a, r: left, o: right }, { d: b, r: right, o: left }].map(({ d, r, o }, k) => (
            <div key={k} className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
              <div className="truncate border-b bg-card px-3 py-2 text-xs font-medium">{d.file.name} · {d.doc.numPages} pages</div>
              <div ref={r} onScroll={() => onScroll(r.current, o.current)} className="flex-1 space-y-4 overflow-auto bg-canvas p-4">
                {Array.from({ length: d.doc.numPages }, (_, i) => <PageCanvas key={i} doc={d.doc} n={i + 1} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6 rounded-xl border bg-canvas p-4">
          <p className="text-xs text-muted-foreground"><span className="mr-1 inline-block size-2 rounded-full bg-destructive" /> Changed pixels are highlighted on the revised page.</p>
          {Array.from({ length: pages }, (_, i) => <DiffPage key={i} a={a.doc} b={b.doc} n={i + 1} />)}
        </div>
      )}
    </div>
  );
}

function PageCanvas({ doc, n }: { doc: PDFDocumentProxy; n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) renderPage(doc, n, ref.current, 1.4); }, [doc, n]);
  return <canvas ref={ref} className="mx-auto w-full max-w-full bg-card page-shadow" />;
}

function DiffPage({ a, b, n }: { a: PDFDocumentProxy; b: PDFDocumentProxy; n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const out = ref.current; if (!out) return;
      const ca = document.createElement("canvas"), cb = document.createElement("canvas");
      if (n <= a.numPages) await renderPage(a, n, ca, 1.2);
      if (n <= b.numPages) await renderPage(b, n, cb, 1.2);
      const w = Math.max(ca.width, cb.width), h = Math.max(ca.height, cb.height);
      out.width = w; out.height = h;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      const getData = (c: HTMLCanvasElement) => {
        const t = document.createElement("canvas"); t.width = w; t.height = h;
        const x = t.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
        if (c.width) x.drawImage(c, 0, 0);
        return x.getImageData(0, 0, w, h);
      };
      const da = getData(ca), db = getData(cb);
      const res = ctx.createImageData(w, h);
      let diff = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
        const g = db.data[i] * 0.3 + db.data[i + 1] * 0.59 + db.data[i + 2] * 0.11;
        if (d > 60) { diff++; res.data[i] = 230; res.data[i + 1] = 40; res.data[i + 2] = 40; res.data[i + 3] = 255; }
        else { const v = 255 - (255 - g) * 0.35; res.data[i] = res.data[i + 1] = res.data[i + 2] = v; res.data[i + 3] = 255; }
      }
      ctx.putImageData(res, 0, 0);
      setPct((diff / (w * h)) * 100);
    })();
  }, [a, b, n]);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>Page {n}</span>
        <span>{pct === null ? <Spinner /> : pct === 0 ? "Identical" : `${pct.toFixed(2)}% changed`}</span>
      </div>
      <canvas ref={ref} className="w-full page-shadow" />
    </div>
  );
}
