import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowDown, ArrowUp, Copy, Download, Droplets, Hash, ImagePlus, Info, LayoutGrid, Link2, Lock, Redo2, RotateCw, Trash2, Type, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Dropzone, Field, inputCls, Spinner } from "./ui";
import { baseName, download, openPdf, renderPage } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { applyLayers, approxTextWidth, imageFileToLayerImg, layerAppliesTo, newLayer, tilePositions, type Layer } from "@/lib/layers";

type Op = (doc: PDFDocument) => Promise<void> | void;
type ToolKey = "pages" | "watermark" | "numbers" | "metadata" | "export";
interface NumSettings { format: string; pos: string; size: number; start: number }

async function applyOp(bytes: Uint8Array, op: Op) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  await op(doc);
  return doc.save();
}

const numberText = (s: NumSettings, i: number, total: number) =>
  s.format.replace("{n}", String(i + s.start)).replace("{total}", String(total + s.start - 1));

const numbersOp = (s: NumSettings): Op => async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const t = numberText(s, i, pages.length);
    const w = font.widthOfTextAtSize(t, s.size);
    const m = 28;
    const x = s.pos.endsWith("left") ? m : s.pos.endsWith("right") ? width - m - w : (width - w) / 2;
    const y = s.pos.startsWith("top") ? height - m : m;
    page.drawText(t, { x, y, size: s.size, font, color: rgb(0.2, 0.2, 0.2) });
  });
};

const TOOLS: { key: ToolKey; name: string; icon: typeof Lock }[] = [
  { key: "pages", name: "Pages", icon: LayoutGrid },
  { key: "watermark", name: "Watermark & links", icon: Droplets },
  { key: "numbers", name: "Page numbers", icon: Hash },
  { key: "metadata", name: "Metadata", icon: Info },
  { key: "export", name: "Protect & export", icon: Lock },
];

/** Slider paired with a typed number input. */
function NumField({ label, value, min, max, step = 1, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="min-w-0 flex-1 accent-foreground" />
        <div className="relative">
          <input type="number" min={min} max={max} step={step} value={value}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
            className="h-8 w-[4.5rem] rounded-md border bg-background pl-2 pr-5 text-xs tabular-nums outline-none focus:border-foreground/50" />
          {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

function LayerSvg({ l, pw, ph }: { l: Layer; pw: number; ph: number }) {
  if (l.kind === "text") {
    const tw = approxTextWidth(l.text, l.size);
    return <>{tilePositions(l, pw, ph, tw, l.size).map(([x, y], i) => (
      <text key={i} x={x} y={y} fontSize={l.size} fill={l.color} opacity={l.opacity} textAnchor="middle" dominantBaseline="central"
        fontFamily="Helvetica, Arial, sans-serif" fontWeight={700} transform={`rotate(${-l.angle} ${x} ${y})`}>{l.text}</text>
    ))}</>;
  }
  if (l.kind === "image") {
    if (!l.img) return null;
    const w = l.size, h = l.size * l.img.aspect;
    return <>{tilePositions(l, pw, ph, w, h).map(([x, y], i) => (
      <image key={i} href={l.img!.dataUrl} x={x - w / 2} y={y - h / 2} width={w} height={h} opacity={l.opacity} transform={`rotate(${-l.angle} ${x} ${y})`} />
    ))}</>;
  }
  const s = l.size, iconW = l.img ? s * 1.4 : 0, gap = l.img && l.text ? s * 0.4 : 0;
  const tw = l.text ? approxTextWidth(l.text, s) * 0.92 : 0;
  const boxW = iconW + gap + tw, boxH = s * 1.4;
  const left = l.x * pw - boxW / 2, top = l.y * ph - boxH / 2;
  return (
    <g opacity={l.opacity}>
      {l.img && <image href={l.img.dataUrl} x={left} y={top + (boxH - iconW * l.img.aspect) / 2} width={iconW} height={iconW * l.img.aspect} />}
      {l.text && <text x={left + iconW + gap} y={top + boxH / 2} fontSize={s} fill={l.color} dominantBaseline="central" fontFamily="Helvetica, Arial, sans-serif" fontWeight={700}>{l.text}</text>}
      <rect x={left} y={top} width={Math.max(boxW, 1)} height={boxH} fill="none" stroke="currentColor" strokeDasharray="3 3" strokeWidth={0.6} className="text-primary/40" />
    </g>
  );
}

function PageView({ doc, n, total, scale, layers, selected, onSelect, onMove, numbers }: {
  doc: PDFDocumentProxy; n: number; total: number; scale: number;
  layers: Layer[] | null; selected: string | null; onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void;
  numbers: NumSettings | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const c = document.createElement("canvas");
    doc.getPage(n).then((p) => { const v = p.getViewport({ scale: 1 }); if (alive) setSize({ w: v.width, h: v.height }); });
    renderPage(doc, n, c, scale).then(() => {
      const t = ref.current; if (!alive || !t) return;
      t.width = c.width; t.height = c.height; t.getContext("2d")!.drawImage(c, 0, 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [doc, n, scale]);

  const toPage = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const visible = layers?.filter((l) => layerAppliesTo(l, n - 1, total)) ?? [];

  return (
    <div className="relative">
      <canvas ref={ref} className="page-shadow block h-auto w-full rounded-sm bg-white" />
      {size && (visible.length > 0 || numbers) && (
        <svg ref={svgRef} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 h-full w-full overflow-hidden"
          onPointerMove={(e) => { if (!drag.current) return; const p = toPage(e); onMove(drag.current.id, p.x - drag.current.dx, p.y - drag.current.dy); }}
          onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          {visible.map((l) => (
            <g key={l.id} className="cursor-move touch-none"
              onPointerDown={(e) => {
                e.preventDefault(); onSelect(l.id);
                (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                const p = toPage(e); drag.current = { id: l.id, dx: p.x - l.x, dy: p.y - l.y };
              }}>
              <LayerSvg l={l} pw={size.w} ph={size.h} />
            </g>
          ))}
          {numbers && (() => {
            const m = 28, t = numberText(numbers, n - 1, total);
            const x = numbers.pos.endsWith("left") ? m : numbers.pos.endsWith("right") ? size.w - m : size.w / 2;
            const y = numbers.pos.startsWith("top") ? m : size.h - m;
            const anchor = numbers.pos.endsWith("left") ? "start" : numbers.pos.endsWith("right") ? "end" : "middle";
            return <text x={x} y={y} fontSize={numbers.size} fill="#333" textAnchor={anchor} fontFamily="Helvetica, Arial, sans-serif" pointerEvents="none">{t}</text>;
          })()}
        </svg>
      )}
    </div>
  );
}

function ImagePick({ onPick, label }: { onPick: (f: File) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="flex h-8 w-full items-center justify-center gap-2 rounded-md border text-xs hover:bg-muted">
        <ImagePlus className="size-3.5" /> {label}
      </button>
      <input ref={ref} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </>
  );
}

export function Workspace() {
  const [name, setName] = useState("");
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [idx, setIdx] = useState(-1);
  const bytes = idx >= 0 ? history[idx] : null;
  const [tool, setTool] = useState<ToolKey>("pages");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1.2);

  const [layers, setLayers] = useState<Layer[]>(() => [newLayer("text")]);
  const [sel, setSel] = useState<string | null>(null);
  const [num, setNum] = useState<NumSettings>({ format: "{n} / {total}", pos: "bottom-center", size: 10, start: 1 });
  const [meta, setMeta] = useState({ title: "", author: "", subject: "", keywords: "" });
  const [pw, setPw] = useState({ user: "", owner: "", noCopy: true, noPrint: false, noModify: true });

  const current = layers.find((l) => l.id === sel) ?? layers[0] ?? null;
  const patch = (id: string, p: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const commit = (b: Uint8Array) => { setHistory((h) => [...h.slice(0, idx + 1), b]); setIdx((i) => i + 1); };

  const open = async (f: File) => {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const d = await PDFDocument.load(buf, { ignoreEncryption: true });
      setMeta({ title: d.getTitle() ?? "", author: d.getAuthor() ?? "", subject: d.getSubject() ?? "", keywords: d.getKeywords() ?? "" });
      setName(f.name); setHistory([buf]); setIdx(0); setTool("pages");
    } catch { toast.error("Couldn't open that PDF"); }
  };

  useEffect(() => {
    if (!bytes) { setDoc(null); return; }
    let alive = true;
    openPdf(bytes).then((d) => { if (alive) setDoc(d); else d.destroy(); }).catch(() => {});
    return () => { alive = false; };
  }, [bytes]);

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
    if (!bytes) return false;
    setBusy(true);
    try { commit(await applyOp(bytes, op)); if (msg) toast.success(msg); return true; }
    catch (e) {
      const m = (e as Error).message;
      toast.error(/encode|WinAnsi/i.test(m) ? "Some characters aren't supported by the built-in font — use Latin text or an image watermark." : m);
      return false;
    } finally { setBusy(false); }
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

  const addLayer = async (kind: Layer["kind"], file?: File) => {
    try {
      const img = file ? await imageFileToLayerImg(file) : undefined;
      const l = newLayer(kind, img ? { img } : {});
      setLayers((ls) => [...ls, l]); setSel(l.id);
    } catch { toast.error("Couldn't read that image"); }
  };

  const exportFile = async () => {
    if (!bytes) return;
    setBusy(true);
    try {
      const d = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (pw.user || pw.owner) {
        d.encrypt({
          userPassword: pw.user, ownerPassword: pw.owner || pw.user || crypto.randomUUID(),
          permissions: { copying: !pw.noCopy, printing: pw.noPrint ? false : "highResolution", modifying: !pw.noModify, annotating: !pw.noModify },
        });
      }
      download(await d.save(), `${baseName(name)}-edited.pdf`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!bytes) {
    return <div className="mx-auto max-w-2xl fade-up"><Dropzone onFiles={(f) => open(f[0])} label="Open a PDF to start working" /></div>;
  }

  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [];
  const pending = tool === "watermark" || tool === "numbers";
  const btn = "h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2";

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
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

          {tool === "pages" && <p className="text-xs text-muted-foreground">Use the controls under each page to rotate, move or delete it. Ctrl+Z undoes.</p>}

          {tool === "watermark" && (<>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => addLayer("text")} className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs hover:bg-muted"><Type className="size-3.5" /> Text</button>
              <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-xs hover:bg-muted">
                <ImagePlus className="size-3.5" /> Image
                <input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) addLayer("image", f); e.target.value = ""; }} />
              </label>
              <button onClick={() => addLayer("link")} className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs hover:bg-muted"><Link2 className="size-3.5" /> Link</button>
            </div>

            {layers.length > 0 && (
              <div className="space-y-1">
                {layers.map((l) => (
                  <div key={l.id} onClick={() => setSel(l.id)}
                    className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs", current?.id === l.id ? "border-foreground/50 bg-muted" : "hover:bg-muted/50")}>
                    {l.kind === "text" ? <Type className="size-3.5" /> : l.kind === "image" ? <ImagePlus className="size-3.5" /> : <Link2 className="size-3.5" />}
                    <span className="min-w-0 flex-1 truncate">{l.kind === "image" ? "Image" : l.text || l.url}</span>
                    <button aria-label="Duplicate layer" onClick={(e) => { e.stopPropagation(); const c = { ...l, id: crypto.randomUUID(), y: Math.min(0.95, l.y + 0.06) }; setLayers((ls) => [...ls, c]); setSel(c.id); }} className="text-muted-foreground hover:text-foreground"><Copy className="size-3.5" /></button>
                    <button aria-label="Remove layer" onClick={(e) => { e.stopPropagation(); setLayers((ls) => ls.filter((x) => x.id !== l.id)); }} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            )}

            {current && (
              <div className="space-y-3 border-t pt-3">
                {current.kind !== "image" && (
                  <Field label={current.kind === "link" ? "Label (optional)" : "Text"}>
                    <input className={inputCls} value={current.text} onChange={(e) => patch(current.id, { text: e.target.value })} />
                  </Field>
                )}
                {current.kind === "link" && (<>
                  <Field label="URL"><input className={inputCls} value={current.url} onChange={(e) => patch(current.id, { url: e.target.value })} placeholder="https://example.com" /></Field>
                  {current.img
                    ? <div className="flex items-center gap-2"><img src={current.img.dataUrl} alt="" className="size-8 rounded border object-contain" /><button onClick={() => patch(current.id, { img: undefined })} className="text-xs text-muted-foreground hover:text-foreground">Remove icon</button></div>
                    : <ImagePick label="Add icon image" onPick={async (f) => { try { patch(current.id, { img: await imageFileToLayerImg(f) }); } catch { toast.error("Couldn't read that image"); } }} />}
                </>)}
                {current.kind === "image" && current.img && <img src={current.img.dataUrl} alt="" className="h-16 w-full rounded border object-contain" />}

                <NumField label={current.kind === "image" ? "Width" : "Size"} suffix="pt" min={4} max={current.kind === "image" ? 800 : 200} value={current.size} onChange={(v) => patch(current.id, { size: v })} />
                <NumField label="Opacity" suffix="%" min={0} max={100} value={Math.round(current.opacity * 100)} onChange={(v) => patch(current.id, { opacity: Math.min(100, Math.max(0, v)) / 100 })} />
                {current.kind !== "link" && <NumField label="Angle" suffix="°" min={-180} max={180} value={current.angle} onChange={(v) => patch(current.id, { angle: v })} />}
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="X position" suffix="%" min={0} max={100} value={Math.round(current.x * 100)} onChange={(v) => patch(current.id, { x: v / 100 })} />
                  <NumField label="Y position" suffix="%" min={0} max={100} value={Math.round(current.y * 100)} onChange={(v) => patch(current.id, { y: v / 100 })} />
                </div>
                {current.kind !== "image" && (
                  <Field label="Color"><input type="color" value={current.color} onChange={(e) => patch(current.id, { color: e.target.value })} className="h-9 w-full rounded-md border bg-background" /></Field>
                )}
                <Field label="Pages" hint="Leave empty for all, e.g. 1-3, 5">
                  <input className={inputCls} value={current.pages} onChange={(e) => patch(current.id, { pages: e.target.value })} placeholder="All pages" />
                </Field>
                {current.kind !== "link" && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={current.tile} onChange={(e) => patch(current.id, { tile: e.target.checked })} /> Tile across page</label>
                )}
                <p className="text-[11px] text-muted-foreground">Tip: drag items directly on the preview to position them.</p>
              </div>
            )}

            <button disabled={busy || layers.length === 0} className={btn}
              onClick={async () => { if (await run((d) => applyLayers(d, layers), "Applied to document")) { setTool("pages"); } }}>
              {busy && <Spinner />} Apply to document
            </button>
          </>)}

          {tool === "numbers" && (<>
            <Field label="Format" hint="{n} = page, {total} = count"><input className={inputCls} value={num.format} onChange={(e) => setNum({ ...num, format: e.target.value })} /></Field>
            <Field label="Position">
              <select className={inputCls} value={num.pos} onChange={(e) => setNum({ ...num, pos: e.target.value })}>
                {["bottom-center", "bottom-left", "bottom-right", "top-center", "top-left", "top-right"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <NumField label="Size" suffix="pt" min={6} max={48} value={num.size} onChange={(v) => setNum({ ...num, size: v })} />
            <Field label="Start at"><input type="number" className={inputCls} value={num.start} onChange={(e) => setNum({ ...num, start: +e.target.value || 1 })} /></Field>
            <button disabled={busy} className={btn} onClick={async () => { if (await run(numbersOp(num), "Page numbers added")) setTool("pages"); }}>
              {busy && <Spinner />} Apply to document
            </button>
          </>)}

          {tool === "metadata" && (<>
            {(["title", "author", "subject", "keywords"] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input className={inputCls} value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></Field>
            ))}
            <button disabled={busy} className={btn} onClick={() => run((d) => {
              d.setTitle(meta.title); d.setAuthor(meta.author); d.setSubject(meta.subject);
              d.setKeywords(meta.keywords.split(",").map((s) => s.trim()).filter(Boolean));
            }, "Metadata saved")}>Save metadata</button>
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

        <button onClick={exportFile} disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50">
          <Download className="size-4" /> Download PDF
        </button>
      </aside>

      <section className="min-w-0 rounded-xl border bg-muted/40 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{pending ? "Live preview — not applied yet" : "Preview"} · {pages.length} pages</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} className="rounded border bg-card px-2 py-1 hover:bg-muted">−</button>
            <span className="w-10 text-center">{Math.round(zoom * 83)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} className="rounded border bg-card px-2 py-1 hover:bg-muted">+</button>
          </div>
        </div>
        {!doc ? <div className="flex justify-center py-20"><Spinner /></div> : (
          <div className="mx-auto space-y-6" style={{ maxWidth: (620 * zoom) / 1.2 }}>
            {pages.map((n) => (
              <div key={n} className="space-y-2">
                <PageView doc={doc} n={n} total={pages.length} scale={zoom * 1.25}
                  layers={tool === "watermark" ? layers : null} selected={current?.id ?? null}
                  onSelect={setSel} onMove={(id, x, y) => patch(id, { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) })}
                  numbers={tool === "numbers" ? num : null} />
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
