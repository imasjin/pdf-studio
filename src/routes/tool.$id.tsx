import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getTool, TOOLS, type ToolId } from "@/lib/tools";
import { CompareTool } from "@/components/pdf/compare";
import { EditorTool } from "@/components/pdf/editor";
import { PrintTool } from "@/components/pdf/print";
import { OrganizeTool } from "@/components/pdf/organize";
import {
  ImagesToPdfTool, MergeTool, MetadataTool, PageNumbersTool, PdfToImagesTool, ProtectTool, SplitTool, UnlockTool, WatermarkTool,
} from "@/components/pdf/simple-tools";

export const Route = createFileRoute("/tool/$id")({
  loader: ({ params }) => {
    const tool = getTool(params.id);
    if (!tool) throw notFound();
    return tool;
  },
  head: ({ loaderData }) => {
    const title = `${loaderData?.name ?? "Tool"} PDF — Folio`;
    const desc = loaderData?.desc ?? "Private PDF tool";
    return {
      meta: [
        { title }, { name: "description", content: desc },
        { property: "og:title", content: title }, { property: "og:description", content: desc },
        { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ToolPage,
});

const VIEWS: Record<ToolId, () => React.ReactNode> = {
  compare: () => <CompareTool />,
  print: () => <PrintTool />,
  edit: () => <EditorTool initialTool="text" />,
  draw: () => <EditorTool initialTool="pen" />,
  watermark: () => <WatermarkTool />,
  protect: () => <ProtectTool />,
  unlock: () => <UnlockTool />,
  merge: () => <MergeTool />,
  split: () => <SplitTool />,
  organize: () => <OrganizeTool />,
  "page-numbers": () => <PageNumbersTool />,
  metadata: () => <MetadataTool />,
  "images-to-pdf": () => <ImagesToPdfTool />,
  "pdf-to-images": () => <PdfToImagesTool />,
};

function ToolPage() {
  const tool = Route.useLoaderData();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 py-8 fade-up">
          <div>
            <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> All tools</Link>
            <h1 className="text-3xl font-semibold tracking-tight">{tool.name}</h1>
            <p className="mt-1 text-muted-foreground">{tool.desc}</p>
          </div>
          <nav className="flex max-w-full gap-1 overflow-x-auto text-sm">
            {TOOLS.filter((t) => t.group === tool.group && t.id !== tool.id).map((t) => (
              <Link key={t.id} to="/tool/$id" params={{ id: t.id }} className="whitespace-nowrap rounded-md border px-3 py-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground">{t.name}</Link>
            ))}
          </nav>
        </div>
        <div key={tool.id} className="fade-up">
          <ClientOnly fallback={<div className="h-64 rounded-xl border border-dashed" />}>{VIEWS[tool.id]()}</ClientOnly>
        </div>
      </main>
    </div>
  );
}
