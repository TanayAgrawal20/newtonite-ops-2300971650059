export type WorkItemListFilters = {
  search: string;
  status: string;
  priority: string;
  type: string;
  teamId: string;
  assigneeId: string;
  sort: string;
  limit: number;
};

export type CursorHistoryState = {
  cursor: string | null;
  history: Array<string | null>;
};

export const defaultWorkItemListFilters: WorkItemListFilters = {
  search: "",
  status: "",
  priority: "",
  type: "",
  teamId: "",
  assigneeId: "",
  sort: "createdAt",
  limit: 20,
};

export const emptyCursorHistory: CursorHistoryState = {
  cursor: null,
  history: [],
};

export function filtersChanged(
  current: WorkItemListFilters,
  next: WorkItemListFilters,
) {
  return (
    current.search !== next.search ||
    current.status !== next.status ||
    current.priority !== next.priority ||
    current.type !== next.type ||
    current.teamId !== next.teamId ||
    current.assigneeId !== next.assigneeId ||
    current.sort !== next.sort ||
    current.limit !== next.limit
  );
}

export function resetCursorHistory(): CursorHistoryState {
  return { cursor: null, history: [] };
}

export function goToNextPage(
  state: CursorHistoryState,
  nextCursor: string,
): CursorHistoryState {
  return {
    cursor: nextCursor,
    history: [...state.history, state.cursor],
  };
}

export function goToPreviousPage(state: CursorHistoryState): CursorHistoryState {
  if (state.history.length === 0) {
    return resetCursorHistory();
  }

  return {
    cursor: state.history[state.history.length - 1] ?? null,
    history: state.history.slice(0, -1),
  };
}

export function workItemListRequestKey(
  filters: WorkItemListFilters,
  cursor: string | null,
) {
  return JSON.stringify({ ...filters, cursor });
}
