import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Columns2, Droplets, FileImage, FileStack, Hash, Images, Info, LayoutGrid, Lock, PenTool, Scissors, Type, Unlock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { TOOLS, type ToolId } from "@/lib/tools";

export const ICONS: Record<ToolId, typeof Lock> = {
  compare: Columns2, edit: Type, draw: PenTool, watermark: Droplets, protect: Lock, unlock: Unlock,
  merge: FileStack, split: Scissors, organize: LayoutGrid, "page-numbers": Hash, metadata: Info,
  "images-to-pdf": Images, "pdf-to-images": FileImage,
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Folio — Private PDF tools in your browser" },
      { name: "description", content: "Compare, edit, draw, watermark, protect, merge and split PDFs. 100% client-side — files never leave your device." },
      { property: "og:title", content: "Folio — Private PDF tools in your browser" },
      { property: "og:description", content: "Every PDF utility you need, running entirely on your device." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const groups = ["View", "Edit", "Pages", "Security", "Convert"] as const;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="py-16 sm:py-24 fade-up">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No uploads · No accounts · No limits</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            PDF tools that never<br />leave your browser.
          </h1>
          <p className="mt-5 max-w-xl text-muted-foreground">
            Compare, edit, sign, watermark and secure documents. Everything is processed locally on your device.
          </p>
        </section>
        <div className="space-y-12">
          {groups.map((g) => (
            <section key={g}>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">{g}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TOOLS.filter((t) => t.group === g).map((t) => {
                  const Icon = ICONS[t.id];
                  return (
                    <Link key={t.id} to="/tool/$id" params={{ id: t.id }}
                      className="group relative flex gap-4 rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-accent">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background transition-transform group-hover:scale-105">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium">{t.name}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{t.desc}</p>
                      </div>
                      <ArrowUpRight className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">Folio · Your files stay on your device.</footer>
    </div>
  );
}
