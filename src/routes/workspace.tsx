import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Workspace } from "@/components/pdf/workspace";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Folio" },
      { name: "description", content: "Open one PDF and apply watermarks, page numbers, page edits, metadata and protection with a live preview." },
      { property: "og:title", content: "Folio Workspace — all PDF tools in one place" },
      { property: "og:description", content: "Edit a PDF with multiple tools and see changes live, entirely in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Workspace</h1>
        <Workspace />
      </main>
    </div>
  ),
});
