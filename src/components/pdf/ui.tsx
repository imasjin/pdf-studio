import { useRef, useState, type ReactNode } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dropzone({
  onFiles, accept = "application/pdf", multiple = false, label, compact,
}: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; label?: string; compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center transition-all",
        compact ? "p-6" : "p-14",
        over ? "border-foreground bg-accent" : "hover:border-foreground/40 hover:bg-muted/50",
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full border bg-card transition-transform group-hover:-translate-y-0.5">
        <Upload className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{label ?? (multiple ? "Drop files or click to browse" : "Drop a file or click to browse")}</p>
        <p className="mt-1 text-xs text-muted-foreground">Processed locally — nothing is uploaded</p>
      </div>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }} />
    </div>
  );
}

export function FileChip({ name, onRemove, extra }: { name: string; onRemove?: () => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">pdf</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {extra}
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground" aria-label="Remove">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-foreground/50 focus:ring-2 focus:ring-ring/20";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-4 rounded-xl border bg-card p-5", className)}>{children}</div>;
}

export function Spinner() {
  return <Loader2 className="size-4 animate-spin" />;
}
