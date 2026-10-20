import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded bg-primary font-mono text-[10px] text-primary-foreground">PDF</span>
          Folio
        </Link>
        <span className="hidden text-xs text-muted-foreground sm:inline">100% in your browser</span>
        <div className="ml-auto"><ThemeToggle /></div>
      </div>
    </header>
  );
}
