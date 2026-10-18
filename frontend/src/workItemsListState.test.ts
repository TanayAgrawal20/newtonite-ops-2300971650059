import { describe, expect, it } from "vitest";
import {
  defaultWorkItemListFilters,
  goToNextPage,
  goToPreviousPage,
  resetCursorHistory,
  filtersChanged,
} from "./workItemsListState";

describe("work item cursor navigation", () => {
  it("resets the cursor history when filters, sort, or page size change", () => {
    const current = {
      ...defaultWorkItemListFilters,
      search: "scale",
      limit: 20,
    };

    expect(
      filtersChanged(current, { ...current, status: "OPEN" }),
    ).toBe(true);
    expect(
      filtersChanged(current, { ...current, sort: "updatedAt" }),
    ).toBe(true);
    expect(filtersChanged(current, { ...current, limit: 50 })).toBe(true);
    expect(filtersChanged(current, { ...current })).toBe(false);

    const history = goToNextPage(
      { cursor: null, history: [] },
      "cursor-page-2",
    );
    expect(history.cursor).toBe("cursor-page-2");
    expect(resetCursorHistory()).toEqual({ cursor: null, history: [] });
  });

  it("returns to the preceding page from the history stack", () => {
    const pageTwo = goToNextPage({ cursor: null, history: [] }, "cursor-2");
    const pageThree = goToNextPage(pageTwo, "cursor-3");
    const backToTwo = goToPreviousPage(pageThree);
    const backToOne = goToPreviousPage(backToTwo);

    expect(backToTwo).toEqual({ cursor: "cursor-2", history: [null] });
    expect(backToOne).toEqual({ cursor: null, history: [] });
    expect(goToPreviousPage(backToOne)).toEqual({ cursor: null, history: [] });
  });
});
