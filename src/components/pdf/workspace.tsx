import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowDown, ArrowUp, Download, Droplets, Hash, Info, LayoutGrid, Lock, Redo2, RotateCw, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Dropzone, Field, inputCls, Spinner } from "./ui";
import { baseName, download, hexToRgb01, openPdf, renderPage } from "@/lib/pdf";
import { cn } from "@/lib/utils";

type Op = (doc: PDFDocument) => Promise<void> | void;
type ToolKey = "pages" | "watermark" | "numbers" | "metadata" | "export";

async function applyOp(bytes: Uint8Array, op: Op) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  await op(doc);
  return doc.save();
}

const watermarkOp = (s: { text: string; size: number; opacity: number; angle: number; color: string; tile: boolean }): Op =>
  async (doc) => {
    if (!s.text.trim()) return;
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const c = hexToRgb01(s.color);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(s.text, s.size);
      const draw = (cx: number, cy: number) => {
        const a = (s.angle * Math.PI) / 180;
        page.drawText(s.text, {
          x: cx - (tw / 2) * Math.cos(a), y: cy - (tw / 2) * Math.sin(a),
          size: s.size, font, color: rgb(c.r, c.g, c.b), opacity: s.opacity, rotate: degrees(s.angle),
        });
      };
      if (s.tile) {
        const step = Math.max(tw, s.size * 4) * 0.9;
        for (let y = 0; y < height + step; y += step) for (let x = 0; x < width + step; x += step) draw(x, y);
      } else draw(width / 2, height / 2);
    }
  };

const numbersOp = (s: { format: string; pos: string; size: number; start: number }): Op => async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const t = s.format.replace("{n}", String(i + s.start)).replace("{total}", String(pages.length + s.start - 1));
    const w = font.widthOfTextAtSize(t, s.size);
    const m = 28;
    const x = s.pos.endsWith("left") ? m : s.pos.endsWith("right") ? width - m - w : (width - w) / 2;
    const y = s.pos.startsWith("top") ? height - m : m;
    page.drawText(t, { x, y, size: s.size, font, color: rgb(0.2, 0.2, 0.2) });
  });
};

const TOOLS: { key: ToolKey; name: string; icon: typeof Lock }[] = [
  { key: "pages", name: "Pages", icon: LayoutGrid },
  { key: "watermark", name: "Watermark", icon: Droplets },
  { key: "numbers", name: "Page numbers", icon: Hash },
  { key: "metadata", name: "Metadata", icon: Info },
  { key: "export", name: "Protect & export", icon: Lock },
];

function PageCanvas({ doc, n, scale }: { doc: PDFDocumentProxy; n: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const c = document.createElement("canvas");
    renderPage(doc, n, c, scale).then(() => {
      const t = ref.current; if (!alive || !t) return;
      t.width = c.width; t.height = c.height; t.getContext("2d")!.drawImage(c, 0, 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [doc, n, scale]);
  return <canvas ref={ref} className="page-shadow h-auto w-full rounded-sm bg-white" />;
}

export function Workspace() {
  const [name, setName] = useState("");
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [idx, setIdx] = useState(-1);
  const bytes = idx >= 0 ? history[idx] : null;
  const [tool, setTool] = useState<ToolKey>("pages");
  const [draft, setDraft] = useState<Uint8Array | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1.2);

  const [wm, setWm] = useState({ text: "CONFIDENTIAL", size: 48, opacity: 0.2, angle: 45, color: "#000000", tile: false });
  const [num, setNum] = useState({ format: "{n} / {total}", pos: "bottom-center", size: 10, start: 1 });
  const [meta, setMeta] = useState({ title: "", author: "", subject: "", keywords: "" });
  const [pw, setPw] = useState({ user: "", owner: "", noCopy: true, noPrint: false, noModify: true });

  const commit = (b: Uint8Array) => {
    setHistory((h) => [...h.slice(0, idx + 1), b]);
    setIdx((i) => i + 1);
    setDraft(null);
  };

  const open = async (f: File) => {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const d = await PDFDocument.load(buf, { ignoreEncryption: true });
      setMeta({ title: d.getTitle() ?? "", author: d.getAuthor() ?? "", subject: d.getSubject() ?? "", keywords: d.getKeywords() ?? "" });
      setName(f.name); setHistory([buf]); setIdx(0); setDraft(null); setTool("pages");
    } catch { toast.error("Couldn't open that PDF"); }
  };

  // Live draft preview for setting-based tools.
  const draftOp: Op | null = useMemo(() => {
    if (tool === "watermark") return watermarkOp(wm);
    if (tool === "numbers") return numbersOp(num);
    return null;
  }, [tool, wm, num]);

  useEffect(() => {
    if (!bytes || !draftOp) { setDraft(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try { const b = await applyOp(bytes, draftOp); if (alive) setDraft(b); } catch { /* ignore */ }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [bytes, draftOp]);

  const shown = draft ?? bytes;
  useEffect(() => {
    if (!shown) { setDoc(null); return; }
    let alive = true;
    openPdf(shown).then((d) => { if (alive) setDoc(d); else d.destroy(); }).catch(() => {});
    return () => { alive = false; };
  }, [shown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target as HTMLElement).closest("input,textarea")) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey && idx > 0) { e.preventDefault(); setIdx(idx - 1); }
      if ((e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) && idx < history.length - 1) { e.preventDefault(); setIdx(idx + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, history.length]);

  const run = async (op: Op, msg?: string) => {
    if (!bytes) return;
    setBusy(true);
    try { commit(await applyOp(bytes, op)); if (msg) toast.success(msg); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const pageOp = (i: number, kind: "rotate" | "delete" | "up" | "down") => run(async (d) => {
    if (kind === "rotate") { const p = d.getPage(i); p.setRotation(degrees((p.getRotation().angle + 90) % 360)); }
    if (kind === "delete") { if (d.getPageCount() === 1) throw new Error("A PDF needs at least one page"); d.removePage(i); }
    if (kind === "up" || kind === "down") {
      const j = kind === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= d.getPageCount()) return;
      const [copy] = await d.copyPages(d, [i]);
      d.removePage(i); d.insertPage(j, copy);
    }
  });

  const exportFile = async () => {
    if (!bytes) return;
    setBusy(true);
    try {
      const d = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (pw.user || pw.owner) {
        d.encrypt({
          userPassword: pw.user, ownerPassword: pw.owner || pw.user || crypto.randomUUID(),
          permissions: { copying: !pw.noCopy, printing: pw.noPrint ? undefined : "highResolution", modifying: !pw.noModify, annotating: !pw.noModify },
        });
      }
      download(await d.save(), `${baseName(name)}-edited.pdf`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!bytes) {
    return (
      <div className="mx-auto max-w-2xl fade-up">
        <Dropzone onFiles={(f) => open(f[0])} label="Open a PDF to start working" />
      </div>
    );
  }

  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
          <button aria-label="Undo" disabled={idx <= 0} onClick={() => setIdx(idx - 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><Undo2 className="size-4" /></button>
          <button aria-label="Redo" disabled={idx >= history.length - 1} onClick={() => setIdx(idx + 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><Redo2 className="size-4" /></button>
          <button aria-label="Close file" onClick={() => { setHistory([]); setIdx(-1); }} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>

        <nav className="grid grid-cols-5 gap-1 rounded-lg border bg-card p-1">
          {TOOLS.map((t) => (
            <button key={t.key} title={t.name} aria-label={t.name} onClick={() => setTool(t.key)}
              className={cn("flex h-9 items-center justify-center rounded-md transition", tool === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              <t.icon className="size-4" />
            </button>
          ))}
        </nav>

        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">{TOOLS.find((t) => t.key === tool)!.name}</h2>

          {tool === "pages" && (
            <p className="text-xs text-muted-foreground">Use the controls under each page in the preview to rotate, move or delete it. Ctrl+Z undoes.</p>
          )}

          {tool === "watermark" && (<>
            <Field label="Text"><input className={inputCls} value={wm.text} onChange={(e) => setWm({ ...wm, text: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Size · ${wm.size}`}><input type="range" min={12} max={120} value={wm.size} onChange={(e) => setWm({ ...wm, size: +e.target.value })} className="w-full accent-foreground" /></Field>
              <Field label={`Opacity · ${Math.round(wm.opacity * 100)}%`}><input type="range" min={0.05} max={1} step={0.05} value={wm.opacity} onChange={(e) => setWm({ ...wm, opacity: +e.target.value })} className="w-full accent-foreground" /></Field>
              <Field label={`Angle · ${wm.angle}°`}><input type="range" min={-90} max={90} value={wm.angle} onChange={(e) => setWm({ ...wm, angle: +e.target.value })} className="w-full accent-foreground" /></Field>
              <Field label="Color"><input type="color" value={wm.color} onChange={(e) => setWm({ ...wm, color: e.target.value })} className="h-9 w-full rounded-md border bg-background" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wm.tile} onChange={(e) => setWm({ ...wm, tile: e.target.checked })} /> Tile across page</label>
          </>)}

          {tool === "numbers" && (<>
            <Field label="Format" hint="{n} = page, {total} = count"><input className={inputCls} value={num.format} onChange={(e) => setNum({ ...num, format: e.target.value })} /></Field>
            <Field label="Position">
              <select className={inputCls} value={num.pos} onChange={(e) => setNum({ ...num, pos: e.target.value })}>
                {["bottom-center", "bottom-left", "bottom-right", "top-center", "top-left", "top-right"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Size"><input type="number" className={inputCls} value={num.size} onChange={(e) => setNum({ ...num, size: +e.target.value || 10 })} /></Field>
              <Field label="Start at"><input type="number" className={inputCls} value={num.start} onChange={(e) => setNum({ ...num, start: +e.target.value || 1 })} /></Field>
            </div>
          </>)}

          {(tool === "watermark" || tool === "numbers") && (
            <button disabled={busy || !draft} onClick={() => draftOp && run(draftOp, "Applied")}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy && <Spinner />} Apply to document
            </button>
          )}

          {tool === "metadata" && (<>
            {(["title", "author", "subject", "keywords"] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input className={inputCls} value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></Field>
            ))}
            <button disabled={busy} onClick={() => run((d) => {
              d.setTitle(meta.title); d.setAuthor(meta.author); d.setSubject(meta.subject);
              d.setKeywords(meta.keywords.split(",").map((s) => s.trim()).filter(Boolean));
            }, "Metadata saved")} className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">Save metadata</button>
          </>)}

          {tool === "export" && (<>
            <Field label="Open password" hint="Optional — required to view the file"><input type="password" className={inputCls} value={pw.user} onChange={(e) => setPw({ ...pw, user: e.target.value })} /></Field>
            <Field label="Owner password" hint="Optional — enforces the restrictions below"><input type="password" className={inputCls} value={pw.owner} onChange={(e) => setPw({ ...pw, owner: e.target.value })} /></Field>
            {([["noCopy", "Block copying text"], ["noPrint", "Block printing"], ["noModify", "Block editing"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pw[k]} onChange={(e) => setPw({ ...pw, [k]: e.target.checked })} /> {l}</label>
            ))}
            <p className="text-[11px] text-muted-foreground">Restrictions apply only when a password is set.</p>
          </>)}
        </div>

        <button onClick={exportFile} disabled={busy}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50">
          <Download className="size-4" /> Download PDF
        </button>
      </aside>

      <section className="min-w-0 rounded-xl border bg-muted/40 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{draft ? "Live preview — not applied yet" : "Preview"} · {pages.length} pages</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} className="rounded border bg-card px-2 py-1 hover:bg-muted">−</button>
            <span className="w-10 text-center">{Math.round(zoom * 83)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} className="rounded border bg-card px-2 py-1 hover:bg-muted">+</button>
          </div>
        </div>
        {!doc ? <div className="flex justify-center py-20"><Spinner /></div> : (
          <div className="mx-auto space-y-6" style={{ maxWidth: 620 * zoom / 1.2 }}>
            {pages.map((n) => (
              <div key={n} className="space-y-2">
                <PageCanvas doc={doc} n={n} scale={zoom * 1.25} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Page {n}</span>
                  {tool === "pages" && (
                    <div className="flex gap-1">
                      {([["up", ArrowUp], ["down", ArrowDown], ["rotate", RotateCw], ["delete", Trash2]] as const).map(([k, I]) => (
                        <button key={k} aria-label={`${k} page ${n}`} disabled={busy} onClick={() => pageOp(n - 1, k)}
                          className="rounded border bg-card p-1.5 hover:bg-muted disabled:opacity-40"><I className="size-3.5" /></button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
