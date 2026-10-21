// Pure page-ordering logic for printing. -1 means a blank side.

export type DuplexMode = "single" | "auto" | "manual";

export interface LayoutOpts {
  pages: number[]; // selected source page indices, in order
  nUp: number; // pages per side
  booklet: boolean;
  reverse: boolean;
}

/** Group pages into printed sides (each side holds nUp source pages). */
export function buildSides({ pages, nUp, booklet, reverse }: LayoutOpts): number[][] {
  if (booklet) {
    const p = [...pages];
    while (p.length % 4) p.push(-1);
    const n = p.length;
    const sides: number[][] = [];
    for (let i = 0; i < n / 4; i++) {
      sides.push([p[n - 1 - 2 * i], p[2 * i]]); // front: last, first
      sides.push([p[2 * i + 1], p[n - 2 - 2 * i]]); // back
    }
    return sides;
  }
  const list = reverse ? [...pages].reverse() : pages;
  const sides: number[][] = [];
  for (let i = 0; i < list.length; i += nUp) {
    const s = list.slice(i, i + nUp);
    while (s.length < nUp) s.push(-1);
    sides.push(s);
  }
  return sides;
}

/** Repeat sides for copies. In duplex, each copy is padded to an even side count so copies never share a sheet. */
export function withCopies<T>(sides: T[], copies: number, duplex: boolean, blank: T): T[] {
  const one = [...sides];
  if (duplex && one.length % 2) one.push(blank);
  const out: T[] = [];
  for (let c = 0; c < Math.max(1, copies); c++) out.push(...one);
  return out;
}

/** Manual duplex: fronts are sides 1,3,5…; backs are 2,4,6… (blank-padded, optionally reversed). */
export function splitManual<T>(sides: T[], blank: T, reverseBacks: boolean) {
  const fronts = sides.filter((_, i) => i % 2 === 0);
  const backs = sides.filter((_, i) => i % 2 === 1);
  while (backs.length < fronts.length) backs.push(blank);
  return { fronts, backs: reverseBacks ? backs.reverse() : backs };
}

export function gridFor(nUp: number): { cols: number; rows: number; landscape: boolean } {
  switch (nUp) {
    case 2: return { cols: 2, rows: 1, landscape: true };
    case 4: return { cols: 2, rows: 2, landscape: false };
    case 6: return { cols: 3, rows: 2, landscape: true };
    case 9: return { cols: 3, rows: 3, landscape: false };
    case 16: return { cols: 4, rows: 4, landscape: false };
    default: return { cols: 1, rows: 1, landscape: false };
  }
}
