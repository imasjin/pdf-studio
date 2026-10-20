import { useState, type ReactNode } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";
import JSZip from "jszip";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropzone, FileChip, Field, Panel, Spinner, inputCls } from "./ui";
import { baseName, download, hexToRgb01, openPdf, parseRanges, renderPage } from "@/lib/pdf";

function useRun() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); toast.success("Done — download started"); }
    catch (e) { console.error(e); toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };
  return { busy, run };
}

function Action({ busy, onClick, children, disabled }: { busy: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Button onClick={onClick} disabled={busy || disabled} className="w-full">
      {busy ? <Spinner /> : <Download className="size-4" />} {children}
    </Button>
  );
}

const load = async (f: File, password?: string) =>
  PDFDocument.load(await f.arrayBuffer(), password ? { password } : { ignoreEncryption: true });

function Layout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="grid gap-6 md:grid-cols-[1fr_320px]"><div className="space-y-3">{left}</div><div>{right}</div></div>;
}

/* ---------------- Merge ---------------- */
export function MergeTool() {
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useRun();
  const move = (i: number, d: number) => setFiles((f) => {
    const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  return (
    <Layout
      left={<>
        <Dropzone multiple onFiles={(f) => setFiles((p) => [...p, ...f])} compact={files.length > 0} />
        {files.map((f, i) => (
          <FileChip key={i + f.name} name={`${i + 1}. ${f.name}`} onRemove={() => setFiles(files.filter((_, k) => k !== i))}
            extra={<span className="flex gap-1 text-muted-foreground">
              <button onClick={() => move(i, -1)} className="hover:text-foreground"><ArrowUp className="size-4" /></button>
              <button onClick={() => move(i, 1)} className="hover:text-foreground"><ArrowDown className="size-4" /></button>
            </span>} />
        ))}
      </>}
      right={<Panel>
        <p className="text-sm text-muted-foreground">{files.length} file(s). Order top to bottom.</p>
        <Action busy={busy} disabled={files.length < 2} onClick={() => run(async () => {
          const out = await PDFDocument.create();
          for (const f of files) {
            const src = await load(f);
            (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
          }
          download(await out.save(), "merged.pdf");
        })}>Merge PDFs</Action>
      </Panel>}
    />
  );
}

/* ---------------- Split ---------------- */
export function SplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"ranges" | "each">("ranges");
  const [ranges, setRanges] = useState("1-2");
  const { busy, run } = useRun();
  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} />;
  return (
    <Layout left={<FileChip name={file.name} onRemove={() => setFile(null)} />}
      right={<Panel>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
          {(["ranges", "each"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-1.5 transition ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {m === "ranges" ? "Extract pages" : "Every page"}
            </button>
          ))}
        </div>
        {mode === "ranges" && <Field label="Pages" hint="e.g. 1-3, 5, 8-"><input className={inputCls} value={ranges} onChange={(e) => setRanges(e.target.value)} /></Field>}
        <Action busy={busy} onClick={() => run(async () => {
          const src = await load(file);
          const total = src.getPageCount();
          if (mode === "ranges") {
            const idx = parseRanges(ranges, total);
            if (!idx.length) throw new Error("No valid pages selected");
            const out = await PDFDocument.create();
            (await out.copyPages(src, idx)).forEach((p) => out.addPage(p));
            download(await out.save(), `${baseName(file.name)}-extract.pdf`);
          } else {
            const zip = new JSZip();
            for (let i = 0; i < total; i++) {
              const out = await PDFDocument.create();
              const [p] = await out.copyPages(src, [i]); out.addPage(p);
              zip.file(`${baseName(file.name)}-p${i + 1}.pdf`, await out.save());
            }
            download(await zip.generateAsync({ type: "blob" }), `${baseName(file.name)}-pages.zip`);
          }
        })}>Split</Action>
      </Panel>} />
  );
}

/* ---------------- Batch watermark ---------------- */
export function WatermarkTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("CONFIDENTIAL");
  const [size, setSize] = useState(60);
  const [opacity, setOpacity] = useState(0.2);
  const [angle, setAngle] = useState(45);
  const [color, setColor] = useState("#000000");
  const [tile, setTile] = useState(false);
  const { busy, run } = useRun();
  return (
    <Layout
      left={<>
        <Dropzone multiple onFiles={(f) => setFiles((p) => [...p, ...f])} compact={files.length > 0} />
        {files.map((f, i) => <FileChip key={i + f.name} name={f.name} onRemove={() => setFiles(files.filter((_, k) => k !== i))} />)}
        {files.length === 0 && (
          <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-xl border bg-canvas">
            <span style={{ fontSize: size / 2.5, opacity, transform: `rotate(${-angle}deg)`, color }} className="font-semibold">{text}</span>
          </div>
        )}
      </>}
      right={<Panel>
        <Field label="Text"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Size ${size}`}><input type="range" min={12} max={160} value={size} onChange={(e) => setSize(+e.target.value)} className="w-full accent-foreground" /></Field>
          <Field label={`Opacity ${Math.round(opacity * 100)}%`}><input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-full accent-foreground" /></Field>
          <Field label={`Angle ${angle}°`}><input type="range" min={-90} max={90} value={angle} onChange={(e) => setAngle(+e.target.value)} className="w-full accent-foreground" /></Field>
          <Field label="Color"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-full rounded-md border bg-background" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)} className="accent-foreground" /> Tile across page</label>
        <Action busy={busy} disabled={!files.length || !text} onClick={() => run(async () => {
          const c = hexToRgb01(color);
          const results: { name: string; data: Uint8Array }[] = [];
          for (const f of files) {
            const doc = await load(f);
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            for (const page of doc.getPages()) {
              const { width, height } = page.getSize();
              const tw = font.widthOfTextAtSize(text, size);
              const rad = (angle * Math.PI) / 180;
              const draw = (cx: number, cy: number) => page.drawText(text, {
                x: cx - (tw / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
                y: cy - (tw / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
                size, font, color: rgb(c.r, c.g, c.b), opacity, rotate: degrees(angle),
              });
              if (tile) {
                const step = tw * 0.9 + size * 2;
                for (let y = 0; y < height + step; y += step * 0.6) for (let x = 0; x < width + step; x += step) draw(x, y);
              } else draw(width / 2, height / 2);
            }
            results.push({ name: `${baseName(f.name)}-watermarked.pdf`, data: await doc.save() });
          }
          if (results.length === 1) download(results[0].data, results[0].name);
          else {
            const zip = new JSZip(); results.forEach((r) => zip.file(r.name, r.data));
            download(await zip.generateAsync({ type: "blob" }), "watermarked.zip");
          }
        })}>Watermark {files.length > 1 ? `${files.length} files` : ""}</Action>
      </Panel>}
    />
  );
}

/* ---------------- Protect ---------------- */
export function ProtectTool() {
  const [file, setFile] = useState<File | null>(null);
  const [userPw, setUserPw] = useState("");
  const [ownerPw, setOwnerPw] = useState("");
  const [perm, setPerm] = useState({ printing: false, copying: false, modifying: false, annotating: false, fillingForms: true, documentAssembly: false, contentAccessibility: true });
  const { busy, run } = useRun();
  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} />;
  const labels: Record<keyof typeof perm, string> = {
    printing: "Allow printing", copying: "Allow copying text & images", modifying: "Allow editing",
    annotating: "Allow comments", fillingForms: "Allow filling forms", documentAssembly: "Allow page assembly",
    contentAccessibility: "Allow screen readers",
  };
  return (
    <Layout left={<>
      <FileChip name={file.name} onRemove={() => setFile(null)} />
      <Panel>
        <p className="text-sm font-medium">Permissions</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(perm) as (keyof typeof perm)[]).map((k) => (
            <label key={k} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input type="checkbox" className="accent-foreground" checked={perm[k]} onChange={(e) => setPerm({ ...perm, [k]: e.target.checked })} />
              {labels[k]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Encrypted with AES-256. Restrictions are honored by standard PDF readers.</p>
      </Panel>
    </>}
      right={<Panel>
        <Field label="Open password (optional)" hint="Required to open the file"><input type="password" className={inputCls} value={userPw} onChange={(e) => setUserPw(e.target.value)} /></Field>
        <Field label="Owner password" hint="Required to change permissions"><input type="password" className={inputCls} value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} /></Field>
        <Action busy={busy} disabled={!ownerPw && !userPw} onClick={() => run(async () => {
          const doc = await load(file);
          doc.encrypt({
            userPassword: userPw, ownerPassword: ownerPw || userPw + "-owner-" + Math.random().toString(36).slice(2),
            permissions: { ...perm, printing: perm.printing ? "highResolution" : false },
          });
          download(await doc.save(), `${baseName(file.name)}-protected.pdf`);
        })}>Protect PDF</Action>
      </Panel>} />
  );
}

/* ---------------- Unlock ---------------- */
export function UnlockTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");
  const { busy, run } = useRun();
  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} />;
  return (
    <Layout left={<FileChip name={file.name} onRemove={() => setFile(null)} />}
      right={<Panel>
        <Field label="Password"><input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Action busy={busy} onClick={() => run(async () => {
          const src = await PDFDocument.load(await file.arrayBuffer(), { password: pw });
          const out = await PDFDocument.create();
          (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
          download(await out.save(), `${baseName(file.name)}-unlocked.pdf`);
        })}>Unlock</Action>
      </Panel>} />
  );
}

/* ---------------- Page numbers ---------------- */
export function PageNumbersTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pos, setPos] = useState("bottom-center");
  const [fmt, setFmt] = useState("{n} / {total}");
  const [size, setSize] = useState(10);
  const [start, setStart] = useState(1);
  const { busy, run } = useRun();
  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} />;
  return (
    <Layout left={<>
      <FileChip name={file.name} onRemove={() => setFile(null)} />
      <Panel>
        <p className="text-xs font-medium text-muted-foreground">Position</p>
        <div className="mx-auto grid aspect-[3/4] w-40 grid-rows-[auto_1fr_auto] rounded-md border bg-canvas p-2">
          {["top", "", "bottom"].map((row, r) => (
            <div key={r} className="grid grid-cols-3 gap-1">
              {row && ["left", "center", "right"].map((col) => {
                const id = `${row}-${col}`;
                return <button key={id} onClick={() => setPos(id)} className={`h-5 rounded transition ${pos === id ? "bg-foreground" : "bg-border hover:bg-muted-foreground/40"}`} />;
              })}
            </div>
          ))}
        </div>
      </Panel>
    </>}
      right={<Panel>
        <Field label="Format" hint="{n} = page, {total} = count"><input className={inputCls} value={fmt} onChange={(e) => setFmt(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Font size"><input type="number" className={inputCls} value={size} onChange={(e) => setSize(+e.target.value)} /></Field>
          <Field label="Start at"><input type="number" className={inputCls} value={start} onChange={(e) => setStart(+e.target.value)} /></Field>
        </div>
        <Action busy={busy} onClick={() => run(async () => {
          const doc = await load(file);
          const font = await doc.embedFont(StandardFonts.Helvetica);
          const pages = doc.getPages();
          const [v, h] = pos.split("-");
          pages.forEach((page, i) => {
            const t = fmt.replace("{n}", String(i + start)).replace("{total}", String(pages.length + start - 1));
            const { width, height } = page.getSize();
            const tw = font.widthOfTextAtSize(t, size);
            const m = 28;
            const x = h === "left" ? m : h === "right" ? width - m - tw : (width - tw) / 2;
            const y = v === "top" ? height - m - size : m;
            page.drawText(t, { x, y, size, font, color: rgb(0.2, 0.2, 0.2) });
          });
          download(await doc.save(), `${baseName(file.name)}-numbered.pdf`);
        })}>Add numbers</Action>
      </Panel>} />
  );
}

/* ---------------- Metadata ---------------- */
export function MetadataTool() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: "", author: "", subject: "", keywords: "", creator: "", producer: "" });
  const [pages, setPages] = useState(0);
  const { busy, run } = useRun();
  const pick = async (f: File) => {
    setFile(f);
    const d = await load(f);
    setPages(d.getPageCount());
    setMeta({ title: d.getTitle() ?? "", author: d.getAuthor() ?? "", subject: d.getSubject() ?? "", keywords: d.getKeywords() ?? "", creator: d.getCreator() ?? "", producer: d.getProducer() ?? "" });
  };
  if (!file) return <Dropzone onFiles={(f) => pick(f[0])} />;
  return (
    <Layout left={<>
      <FileChip name={file.name} onRemove={() => setFile(null)} extra={<span className="text-xs text-muted-foreground">{pages} pages · {(file.size / 1024).toFixed(0)} KB</span>} />
      <Panel>
        {(Object.keys(meta) as (keyof typeof meta)[]).map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input className={inputCls} value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></Field>
        ))}
      </Panel>
    </>}
      right={<Panel>
        <Action busy={busy} onClick={() => run(async () => {
          const d = await load(file);
          d.setTitle(meta.title); d.setAuthor(meta.author); d.setSubject(meta.subject);
          d.setKeywords(meta.keywords.split(/[,;]\s*/).filter(Boolean)); d.setCreator(meta.creator); d.setProducer(meta.producer);
          download(await d.save(), file.name);
        })}>Save metadata</Action>
        <Button variant="outline" className="w-full" onClick={() => setMeta({ title: "", author: "", subject: "", keywords: "", creator: "", producer: "" })}>Clear all fields</Button>
      </Panel>} />
  );
}

/* ---------------- Images to PDF ---------------- */
export function ImagesToPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [fit, setFit] = useState<"a4" | "image">("a4");
  const { busy, run } = useRun();
  return (
    <Layout
      left={<>
        <Dropzone multiple accept="image/png,image/jpeg,image/webp" label="Drop images or click to browse" onFiles={(f) => setFiles((p) => [...p, ...f])} compact={files.length > 0} />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {files.map((f, i) => (
            <div key={i + f.name} className="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-canvas">
              <img src={URL.createObjectURL(f)} className="size-full object-contain" alt="" />
              <button onClick={() => setFiles(files.filter((_, k) => k !== i))} className="absolute right-1 top-1 rounded bg-background/90 px-1.5 text-xs opacity-0 transition group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      </>}
      right={<Panel>
        <Field label="Page size">
          <select className={inputCls} value={fit} onChange={(e) => setFit(e.target.value as "a4" | "image")}>
            <option value="a4">A4 (fit image)</option><option value="image">Match image size</option>
          </select>
        </Field>
        <Action busy={busy} disabled={!files.length} onClick={() => run(async () => {
          const doc = await PDFDocument.create();
          for (const f of files) {
            let bytes = new Uint8Array(await f.arrayBuffer());
            let isPng = f.type === "image/png";
            if (f.type === "image/webp") {
              const bmp = await createImageBitmap(f); const c = document.createElement("canvas");
              c.width = bmp.width; c.height = bmp.height; c.getContext("2d")!.drawImage(bmp, 0, 0);
              bytes = new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"))).arrayBuffer()); isPng = true;
            }
            const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
            if (fit === "image") doc.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            else {
              const W = 595.28, H = 841.89, m = 24;
              const s = Math.min((W - m * 2) / img.width, (H - m * 2) / img.height);
              const w = img.width * s, h = img.height * s;
              doc.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
            }
          }
          download(await doc.save(), "images.pdf");
        })}>Create PDF</Action>
      </Panel>}
    />
  );
}

/* ---------------- PDF to images ---------------- */
export function PdfToImagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [scale, setScale] = useState(2);
  const { busy, run } = useRun();
  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} />;
  return (
    <Layout left={<FileChip name={file.name} onRemove={() => setFile(null)} />}
      right={<Panel>
        <Field label="Format">
          <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}>
            <option value="png">PNG</option><option value="jpeg">JPG</option>
          </select>
        </Field>
        <Field label={`Quality ${scale}x`}><input type="range" min={1} max={4} step={0.5} value={scale} onChange={(e) => setScale(+e.target.value)} className="w-full accent-foreground" /></Field>
        <Action busy={busy} onClick={() => run(async () => {
          const doc = await openPdf(await file.arrayBuffer());
          const zip = new JSZip(); const c = document.createElement("canvas");
          for (let i = 1; i <= doc.numPages; i++) {
            await renderPage(doc, i, c, scale);
            const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), `image/${format}`, 0.92));
            zip.file(`${baseName(file.name)}-${i}.${format === "png" ? "png" : "jpg"}`, blob);
          }
          download(await zip.generateAsync({ type: "blob" }), `${baseName(file.name)}-images.zip`);
        })}>Export images</Action>
      </Panel>} />
  );
}
