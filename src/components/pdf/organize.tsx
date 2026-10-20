import { useState } from "react";
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { RotateCw, Trash2, Download, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropzone, FileChip, Spinner } from "./ui";
import { baseName, download, openPdf, renderToDataUrl } from "@/lib/pdf";

interface Pg { idx: number; rot: number; img: string; deleted: boolean }

export function OrganizeTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<Pg[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File) => {
    setFile(f); setPages([]);
    const doc = await openPdf(await f.arrayBuffer());
    const list: Pg[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      list.push({ idx: i - 1, rot: 0, img: await renderToDataUrl(doc, i, 0.35), deleted: false });
      setPages([...list]);
    }
  };

  const update = (i: number, p: Partial<Pg>) => setPages((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const keep = pages.filter((p) => !p.deleted);
      const copied = await out.copyPages(src, keep.map((p) => p.idx));
      copied.forEach((pg, i) => {
        pg.setRotation(degrees((pg.getRotation().angle + keep[i].rot) % 360));
        out.addPage(pg);
      });
      download(await out.save(), `${baseName(file.name)}-organized.pdf`);
      toast.success("Saved");
    } catch (e) { toast.error(String(e)); } finally { setBusy(false); }
  };

  if (!file) return <Dropzone onFiles={(f) => pick(f[0])} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><FileChip name={file.name} onRemove={() => setFile(null)} /></div>
        <Button variant="outline" onClick={() => setPages((s) => s.map((p) => ({ ...p, rot: (p.rot + 90) % 360 })))}><RotateCw className="size-4" /> Rotate all</Button>
        <Button onClick={save} disabled={busy}>{busy ? <Spinner /> : <Download className="size-4" />} Save</Button>
      </div>
      <p className="text-xs text-muted-foreground">Drag pages to reorder.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {pages.map((p, i) => (
          <div key={p.idx} draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (drag === null || drag === i) return;
              setPages((s) => { const n = [...s]; const [m] = n.splice(drag, 1); n.splice(i, 0, m); return n; });
              setDrag(i);
            }}
            onDragEnd={() => setDrag(null)}
            className={`group relative cursor-grab rounded-lg border bg-card p-2 transition ${drag === i ? "opacity-40" : ""} ${p.deleted ? "opacity-30" : ""}`}>
            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-canvas">
              <img src={p.img} alt="" className="max-h-full max-w-full transition-transform duration-300 page-shadow" style={{ transform: `rotate(${p.rot}deg)` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">{p.idx + 1}</span>
              <span className="flex gap-1">
                <button onClick={() => update(i, { rot: (p.rot + 90) % 360 })} className="rounded p-1 hover:bg-accent"><RotateCw className="size-3.5" /></button>
                <button onClick={() => update(i, { deleted: !p.deleted })} className="rounded p-1 hover:bg-accent">
                  {p.deleted ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
