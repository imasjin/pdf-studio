import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { Download, Eraser, Highlighter, MousePointer2, Pen, Square, Type, Undo2, Eraser as WhiteoutIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropzone, FileChip, Spinner } from "./ui";
import { baseName, download, hexToRgb01, openPdf } from "@/lib/pdf";
import { cn } from "@/lib/utils";

type Tool = "select" | "text" | "pen" | "highlight" | "rect" | "whiteout" | "erase";
type Obj =
  | { id: number; page: number; kind: "text"; x: number; y: number; text: string; size: number; color: string }
  | { id: number; page: number; kind: "rect" | "whiteout"; x: number; y: number; w: number; h: number; color: string }
  | { id: number; page: number; kind: "pen" | "highlight"; pts: [number, number][]; color: string; width: number };

const S = 1.4; // display scale px per PDF point
let nextId = 1;

export function EditorTool({ initialTool }: { initialTool: Tool }) {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [tool, setTool] = useState<Tool>(initialTool);
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(16);
  const [stroke, setStroke] = useState(3);
  const [objs, setObjs] = useState<Obj[]>([]);
  const [history, setHistory] = useState<Obj[][]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const commit = (next: Obj[]) => { setHistory((h) => [...h.slice(-50), objs]); setObjs(next); };
  const undo = () => setHistory((h) => { if (!h.length) return h; setObjs(h[h.length - 1]); return h.slice(0, -1); });

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "z" && editing === null) { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const pick = async (f: File) => { setFile(f); setObjs([]); setHistory([]); setDoc(await openPdf(await f.arrayBuffer())); };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const pages = pdf.getPages();
      for (const o of objs) {
        const page = pages[o.page]; const H = page.getHeight();
        const c = hexToRgb01(o.color); const col = rgb(c.r, c.g, c.b);
        if (o.kind === "text") {
          o.text.split("\n").forEach((line, i) =>
            page.drawText(line, { x: o.x, y: H - o.y - o.size * (i + 1) * 1.0 + o.size * 0.2, size: o.size, font, color: col }));
        } else if (o.kind === "rect" || o.kind === "whiteout") {
          page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h,
            ...(o.kind === "whiteout" ? { color: rgb(1, 1, 1) } : { borderColor: col, borderWidth: 2 }) });
        } else if ((o.kind === "pen" || o.kind === "highlight") && o.pts.length > 1) {
          const d = "M " + o.pts.map(([x, y]) => `${x} ${y}`).join(" L ");
          page.drawSvgPath(d, { x: 0, y: H, borderColor: col, borderWidth: o.width, borderOpacity: o.kind === "highlight" ? 0.35 : 1, borderLineCap: 1 as never });
        }
      }
      download(await pdf.save(), `${baseName(file.name)}-edited.pdf`);
      toast.success("Saved");
    } catch (e) { console.error(e); toast.error("Could not save this PDF"); } finally { setBusy(false); }
  };

  if (!file) return <Dropzone onFiles={(f) => pick(f[0])} />;

  const tools: { id: Tool; icon: typeof Pen; label: string }[] = [
    { id: "select", icon: MousePointer2, label: "Move" },
    { id: "text", icon: Type, label: "Text" },
    { id: "pen", icon: Pen, label: "Pen" },
    { id: "highlight", icon: Highlighter, label: "Highlight" },
    { id: "rect", icon: Square, label: "Box" },
    { id: "whiteout", icon: WhiteoutIcon, label: "Whiteout" },
    { id: "erase", icon: Eraser, label: "Erase" },
  ];

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/90 p-2 backdrop-blur">
        <div className="flex gap-0.5">
          {tools.map((t) => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
              className={cn("flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm transition", tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              <t.icon className="size-4" /><span className="hidden lg:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-border" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-9 cursor-pointer rounded-md border bg-background p-1" title="Color" />
        {tool === "text" ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Size<input type="range" min={8} max={48} value={size} onChange={(e) => setSize(+e.target.value)} className="w-20 accent-foreground" /></label>
        ) : (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Stroke<input type="range" min={1} max={20} value={stroke} onChange={(e) => setStroke(+e.target.value)} className="w-20 accent-foreground" /></label>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={!history.length}><Undo2 className="size-4" /></Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Download className="size-4" />} Save PDF</Button>
        </div>
      </div>
      <FileChip name={file.name} onRemove={() => { setFile(null); setDoc(null); }} />
      <div className="space-y-6 rounded-xl border bg-canvas p-4 sm:p-8">
        {!doc ? <div className="flex justify-center p-10"><Spinner /></div> :
          Array.from({ length: doc.numPages }, (_, i) => (
            <EditablePage key={i} doc={doc} n={i} tool={tool} color={color} size={size} stroke={stroke}
              objs={objs.filter((o) => o.page === i)} all={objs} commit={commit} setObjs={setObjs}
              editing={editing} setEditing={setEditing} />
          ))}
      </div>
    </div>
  );
}

function EditablePage(p: {
  doc: PDFDocumentProxy; n: number; tool: Tool; color: string; size: number; stroke: number;
  objs: Obj[]; all: Obj[]; commit: (o: Obj[]) => void; setObjs: (o: Obj[]) => void;
  editing: number | null; setEditing: (id: number | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [draft, setDraft] = useState<Obj | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; orig: Obj; base: Obj[] } | null>(null);

  useEffect(() => {
    (async () => {
      const page = await p.doc.getPage(p.n + 1);
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: S * dpr });
      const c = canvas.current!; c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c } as never).promise;
      setDim({ w: vp.width / dpr / S, h: vp.height / dpr / S });
    })();
  }, [p.doc, p.n]);

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * dim!.w, ((e.clientY - r.top) / r.height) * dim!.h];
  };

  const down = (e: React.PointerEvent) => {
    if (!dim || p.editing !== null) { p.setEditing(null); return; }
    const [x, y] = pt(e);
    if (p.tool === "text") {
      const o: Obj = { id: nextId++, page: p.n, kind: "text", x, y: y - p.size / 2, text: "", size: p.size, color: p.color };
      p.commit([...p.all, o]); p.setEditing(o.id); return;
    }
    if (p.tool === "pen" || p.tool === "highlight") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraft({ id: nextId++, page: p.n, kind: p.tool, pts: [[x, y]], color: p.tool === "highlight" && p.color === "#111111" ? "#ffd400" : p.color, width: p.tool === "highlight" ? p.stroke * 4 : p.stroke });
    }
    if (p.tool === "rect" || p.tool === "whiteout") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDraft({ id: nextId++, page: p.n, kind: p.tool, x, y, w: 0, h: 0, color: p.color });
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!dim) return;
    const [x, y] = pt(e);
    if (drag.current) {
      const d = drag.current; const dx = x - d.sx, dy = y - d.sy; const o = d.orig;
      const moved: Obj = o.kind === "pen" || o.kind === "highlight"
        ? { ...o, pts: o.pts.map(([a, b]) => [a + dx, b + dy] as [number, number]) }
        : { ...o, x: (o as { x: number }).x + dx, y: (o as { y: number }).y + dy } as Obj;
      p.setObjs(d.base.map((q) => (q.id === d.id ? moved : q)));
      return;
    }
    if (!draft) return;
    if (draft.kind === "pen" || draft.kind === "highlight") setDraft({ ...draft, pts: [...draft.pts, [x, y]] });
    else if (draft.kind === "rect" || draft.kind === "whiteout") setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
  };
  const up = () => {
    drag.current = null;
    if (!draft) return;
    let o = draft;
    if (o.kind === "rect" || o.kind === "whiteout") {
      o = { ...o, x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
      if (o.w < 3 || o.h < 3) { setDraft(null); return; }
    }
    p.commit([...p.all, o]); setDraft(null);
  };

  const objDown = (e: React.PointerEvent, o: Obj) => {
    if (p.tool === "erase") { e.stopPropagation(); p.commit(p.all.filter((q) => q.id !== o.id)); return; }
    if (p.tool === "select") {
      e.stopPropagation();
      const parent = (e.currentTarget as Element).closest("[data-surface]") as HTMLElement;
      parent.setPointerCapture?.(e.pointerId);
      const r = parent.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * dim!.w, sy = ((e.clientY - r.top) / r.height) * dim!.h;
      p.commit(p.all); // snapshot for undo
      drag.current = { id: o.id, sx, sy, orig: o, base: p.all };
    }
  };

  const render = (o: Obj, isDraft = false) => {
    const common = { onPointerDown: isDraft ? undefined : (e: React.PointerEvent) => objDown(e, o), style: { cursor: p.tool === "erase" ? "not-allowed" : p.tool === "select" ? "move" : undefined } };
    if (o.kind === "pen" || o.kind === "highlight")
      return <polyline key={o.id} {...common} points={o.pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={o.color} strokeWidth={o.width}
        strokeOpacity={o.kind === "highlight" ? 0.35 : 1} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />;
    if (o.kind === "rect" || o.kind === "whiteout") {
      const x = Math.min(o.x, o.x + o.w), y = Math.min(o.y, o.y + o.h);
      return <rect key={o.id} {...common} x={x} y={y} width={Math.abs(o.w)} height={Math.abs(o.h)}
        fill={o.kind === "whiteout" ? "#ffffff" : "transparent"} stroke={o.kind === "whiteout" ? (isDraft ? "#999" : "none") : o.color}
        strokeDasharray={isDraft && o.kind === "whiteout" ? "4" : undefined} strokeWidth={2} pointerEvents="all" />;
    }
    return null;
  };

  const cursor = { text: "text", pen: "crosshair", highlight: "crosshair", rect: "crosshair", whiteout: "crosshair", erase: "default", select: "default" }[p.tool];

  return (
    <div className="mx-auto w-fit fade-up">
      <div className="mb-1.5 text-center font-mono text-[11px] text-muted-foreground">{p.n + 1}</div>
      <div data-surface className="relative touch-none select-none bg-card page-shadow" style={{ width: dim ? dim.w * S : 600, maxWidth: "100%", cursor }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        <canvas ref={canvas} className="block w-full" style={{ aspectRatio: dim ? `${dim.w}/${dim.h}` : "3/4" }} />
        {dim && (
          <svg viewBox={`0 0 ${dim.w} ${dim.h}`} className="absolute inset-0 size-full">
            {p.objs.map((o) => render(o))}
            {draft && render(draft, true)}
          </svg>
        )}
        {dim && p.objs.filter((o) => o.kind === "text").map((o) => o.kind === "text" && (
          <div key={o.id} onPointerDown={(e) => { if (p.tool === "text") { e.stopPropagation(); p.setEditing(o.id); } else objDown(e, o); }}
            className={cn("absolute whitespace-pre font-[Helvetica,Arial,sans-serif] leading-none", p.editing === o.id ? "" : "hover:outline hover:outline-1 hover:outline-ring")}
            style={{ left: `${(o.x / dim.w) * 100}%`, top: `${(o.y / dim.h) * 100}%`, fontSize: `calc(${o.size * S}px * var(--z, 1))`, color: o.color, cursor: p.tool === "select" ? "move" : p.tool === "erase" ? "not-allowed" : "text" }}>
            {p.editing === o.id ? (
              <textarea autoFocus value={o.text} rows={Math.max(1, o.text.split("\n").length)}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => p.setObjs(p.all.map((q) => (q.id === o.id ? { ...q, text: e.target.value } as Obj : q)))}
                onBlur={() => { if (!o.text.trim()) p.setObjs(p.all.filter((q) => q.id !== o.id)); p.setEditing(null); }}
                onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
                className="m-0 resize-none overflow-hidden border border-dashed border-ring bg-transparent p-0 leading-none outline-none"
                style={{ font: "inherit", color: "inherit", width: `${Math.max(4, ...o.text.split("\n").map((l) => l.length + 1))}ch` }} />
            ) : o.text}
          </div>
        ))}
      </div>
    </div>
  );
}
