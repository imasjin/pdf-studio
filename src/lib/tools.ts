export type ToolId =
  | "compare" | "edit" | "draw" | "watermark" | "protect" | "merge" | "split"
  | "organize" | "page-numbers" | "images-to-pdf" | "pdf-to-images" | "metadata" | "unlock" | "print";

export interface ToolMeta {
  id: ToolId;
  name: string;
  desc: string;
  group: "View" | "Edit" | "Pages" | "Security" | "Convert";
}

export const TOOLS: ToolMeta[] = [
  { id: "compare", name: "Compare", desc: "Two PDFs side by side with visual diff highlighting.", group: "View" },
  { id: "edit", name: "Edit", desc: "Add text, shapes and whiteout anywhere on a page.", group: "Edit" },
  { id: "draw", name: "Draw", desc: "Freehand pen, highlighter and signatures.", group: "Edit" },
  { id: "watermark", name: "Batch watermark", desc: "Stamp text on many PDFs at once.", group: "Edit" },
  { id: "page-numbers", name: "Page numbers", desc: "Number pages with custom position and format.", group: "Edit" },
  { id: "merge", name: "Merge", desc: "Combine multiple PDFs into one.", group: "Pages" },
  { id: "split", name: "Split", desc: "Extract ranges or split into single pages.", group: "Pages" },
  { id: "organize", name: "Organize", desc: "Reorder, rotate and delete pages.", group: "Pages" },
  { id: "protect", name: "Protect", desc: "Password, block copying, printing and editing.", group: "Security" },
  { id: "unlock", name: "Unlock", desc: "Remove a known password from a PDF.", group: "Security" },
  { id: "metadata", name: "Metadata", desc: "View and edit title, author and keywords.", group: "Security" },
  { id: "images-to-pdf", name: "Images to PDF", desc: "Turn JPG and PNG files into a PDF.", group: "Convert" },
  { id: "print", name: "Print", desc: "Double-sided, booklets, pages per sheet and more.", group: "View" },
  { id: "pdf-to-images", name: "PDF to images", desc: "Export every page as PNG or JPG.", group: "Convert" },
];

export const getTool = (id: string) => TOOLS.find((t) => t.id === id);
