import { describe, expect, it } from "vitest";
import { buildSides, splitManual, withCopies } from "@/lib/print";

describe("double-sided printing", () => {
  it("manual duplex: page 1 front, page 2 back, page 3 next sheet front", () => {
    const sides = buildSides({ pages: [0, 1, 2, 3, 4], nUp: 1, booklet: false, reverse: false });
    const { fronts, backs } = splitManual(sides, [-1], false);
    expect(fronts).toEqual([[0], [2], [4]]);
    expect(backs).toEqual([[1], [3], [-1]]);
  });
  it("reversed backs for printers that stack face up", () => {
    const sides = buildSides({ pages: [0, 1, 2, 3], nUp: 1, booklet: false, reverse: false });
    expect(splitManual(sides, [-1], true).backs).toEqual([[3], [1]]);
  });
  it("booklet of 8 pages orders 8-1 / 2-7 / 6-3 / 4-5", () => {
    const s = buildSides({ pages: [0, 1, 2, 3, 4, 5, 6, 7], nUp: 2, booklet: true, reverse: false });
    expect(s).toEqual([[7, 0], [1, 6], [5, 2], [3, 4]]);
  });
  it("duplex copies never share a sheet", () => {
    expect(withCopies([[0], [1], [2]], 2, true, [-1])).toEqual([[0], [1], [2], [-1], [0], [1], [2], [-1]]);
  });
});
