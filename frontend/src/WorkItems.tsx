import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Check,
  CirclePlus,
  ClipboardList,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRoundCheck,
  X,
} from "lucide-react";
import { api } from "./api";
import {
  defaultWorkItemListFilters,
  emptyCursorHistory,
  goToNextPage,
  goToPreviousPage,
  resetCursorHistory,
  type WorkItemListFilters,
} from "./workItemsListState";

type WorkItem = {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  priority: string;
  status: string;
  version: number;
  teamId: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  team?: { name?: string };
  creator?: { name?: string };
  assignee?: { name?: string; email?: string } | null;
};

type Team = { id: string; name: string };

type TeamMembership = {
  teamId: string;
  role: "ADMIN" | "LEAD" | "MEMBER" | "VIEWER";
};

type CurrentUser = {
  id: string;
  globalRole: "ADMIN" | "USER";
  memberships: TeamMembership[];
};

type WorkItemListResponse = {
  items: WorkItem[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

type ActivityEvent = {
  id: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdAt: string;
  actor?: { name?: string; email?: string };
};

type WorkItemComment = {
  id: string;
  content: string;
  createdAt: string;
  author?: {
    name?: string;
    email?: string;
  };
};

const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "RESOLVED",
  "CLOSED",
];

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: { data?: { message?: string; error?: string } };
      }
    ).response;
    return (
      response?.data?.message || response?.data?.error || "Request failed."
    );
  }
  return error instanceof Error ? error.message : "Request failed.";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusClass(status: string) {
  return `status-pill status-${status.toLowerCase()}`;
}

export default function WorkItems() {
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState<WorkItemListFilters>(
    defaultWorkItemListFilters,
  );
  const [cursorState, setCursorState] = useState(emptyCursorHistory);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState(0);
  const requestSequence = useRef(0);

  const [showCreate, setShowCreate] = useState(false);
  const [activityItem, setActivityItem] = useState<WorkItem | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [comments, setComments] = useState<WorkItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("TASK");
  const [priority, setPriority] = useState("MEDIUM");
  const [teamId, setTeamId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const loadItems = useCallback(async (cursorOverride?: string | null) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    setError("");

    try {
      const params: Record<string, string | number> = {
        limit: filters.limit,
        sort: filters.sort,
      };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.type) params.type = filters.type;
      if (filters.teamId) params.teamId = filters.teamId;
      if (filters.assigneeId) params.assigneeId = filters.assigneeId;
      const cursor =
        cursorOverride !== undefined ? cursorOverride : cursorState.cursor;
      if (cursor) params.cursor = cursor;

      const response = await api.get("/work-items", { params });

      if (sequence !== requestSequence.current) {
        return;
      }

      const payload = response.data?.data as WorkItemListResponse | WorkItem[];
      const list = Array.isArray(payload) ? payload : payload?.items;
      const itemsOnPage = Array.isArray(list) ? list : [];

      setItems(itemsOnPage);
      setResultCount(itemsOnPage.length);
      setHasMore(Array.isArray(payload) ? false : Boolean(payload?.hasMore));
      setNextCursor(Array.isArray(payload) ? null : payload?.nextCursor ?? null);
    } catch (err: unknown) {
      if (sequence !== requestSequence.current) {
        return;
      }

      setError(getErrorMessage(err));
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [cursorState.cursor, filters]);

  const loadTeams = useCallback(async () => {
    try {
      const response = await api.get("/teams");
      const payload = response.data?.data;
      const list = Array.isArray(payload) ? payload : payload?.items;
      const nextTeams = Array.isArray(list) ? list : [];
      setTeams(nextTeams);
      if (nextTeams.length > 0)
        setTeamId((current) => current || nextTeams[0].id);
    } catch {
      // If a teams endpoint is not implemented, use the seeded IDs supplied below
      // or add a teams endpoint before enabling work-item creation.
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const response = await api.get("/auth/me");
      setCurrentUser(response.data.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("accessToken")) {
      navigate("/login", { replace: true });
      return;
    }
    void loadItems();
    void loadTeams();
    void loadCurrentUser();
  }, [navigate, loadItems, loadTeams, loadCurrentUser]);

  async function createItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!teamId) {
      setError("Select a team before creating a work item.");
      return;
    }

    try {
      await api.post("/work-items", {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        teamId,
        dueDate: dueDate
          ? new Date(`${dueDate}T12:00:00`).toISOString()
          : undefined,
      });

      setTitle("");
      setDescription("");
      setType("TASK");
      setPriority("MEDIUM");
      setDueDate("");
      setShowCreate(false);
      setCursorState(resetCursorHistory());
      setNotice("Work item created successfully.");
      await loadItems(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function claimItem(item: WorkItem) {
    setBusyId(item.id);
    setError("");
    setNotice("");

    try {
      await api.post(`/work-items/${item.id}/claim`);
      setNotice(`Claimed "${item.title}".`);
      await loadItems();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  async function changeStatus(item: WorkItem, status: string) {
    setBusyId(item.id);
    setError("");
    setNotice("");

    try {
      await api.patch(`/work-items/${item.id}/status`, {
        status,
        version: item.version,
      });
      setNotice(`Updated "${item.title}".`);
      await loadItems();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  async function showActivity(item: WorkItem) {
    setComments([]);
    setCommentText("");
    setCommentError("");
    setActivityItem(item);
    setActivity([]);
    setActivityLoading(true);
    setError("");

    void loadComments(item.id);
    try {
      const response = await api.get(`/work-items/${item.id}/activity`);
      const payload = response.data?.data;
      setActivity(Array.isArray(payload) ? payload : (payload?.items ?? []));
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadComments(itemId: string) {
    setCommentsLoading(true);
    setCommentError("");

    try {
      const response = await api.get(`/work-items/${itemId}/comments`);
      const payload = response.data?.data;

      setComments(Array.isArray(payload) ? payload : []);
    } catch (err: unknown) {
      setCommentError(getErrorMessage(err));
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activityItem || !commentText.trim()) {
      return;
    }

    setCommentSubmitting(true);
    setCommentError("");

    try {
      await api.post(`/work-items/${activityItem.id}/comments`, {
        content: commentText.trim(),
      });

      setCommentText("");
      await loadComments(activityItem.id);
    } catch (err: unknown) {
      setCommentError(getErrorMessage(err));
    } finally {
      setCommentSubmitting(false);
    }
  }

  function canMoveTo(item: WorkItem, nextStatus: string) {
    const transitions: Record<string, string[]> = {
      OPEN: ["IN_PROGRESS"],
      IN_PROGRESS: ["OPEN", "AWAITING_APPROVAL"],
      AWAITING_APPROVAL: ["IN_PROGRESS", "RESOLVED"],
      RESOLVED: ["CLOSED", "IN_PROGRESS"],
      CLOSED: [],
    };
    return transitions[item.status]?.includes(nextStatus) ?? false;
  }

  const canManageTeam = (teamId: string) => {
    if (currentUser?.globalRole === "ADMIN") return true;

    const role = currentUser?.memberships.find(
      (membership) => membership.teamId === teamId,
    )?.role;

    return role === "ADMIN" || role === "LEAD" || role === "MEMBER";
  };

  const canCreateWorkItems =
    currentUser?.globalRole === "ADMIN" ||
    (currentUser?.memberships.some(
      (membership) =>
        membership.role === "ADMIN" ||
        membership.role === "LEAD" ||
        membership.role === "MEMBER",
    ) ??
      false);

  return (
    <main className="work-items-page">
      <header className="work-items-header">
        <button className="icon-button" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={17} /> Dashboard
        </button>
        <div className="work-items-brand">
          <ClipboardList size={21} />
          <strong>Work Items</strong>
        </div>
        <button className="icon-button" onClick={() => void loadItems()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <div className="work-items-content">
        <div className="work-items-title-row">
          <div>
            <p className="eyebrow">OPERATIONS WORKSPACE</p>
            <h1>Work items</h1>
            <p className="work-items-subtitle">
              Find work, take ownership, and track progress through approval.
            </p>
          </div>
          {canCreateWorkItems && (
            <button
              className="primary-button"
              onClick={() => setShowCreate(true)}
            >
              <CirclePlus size={17} /> Create work item
            </button>
          )}
        </div>

        {error && (
          <div className="work-alert" role="alert">
            <ShieldAlert size={17} />
            {error}
          </div>
        )}
        {notice && (
          <div className="work-notice" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}

        <section className="filter-panel">
          <div className="search-field">
            <Search size={17} />
            <input
              value={filters.search}
              placeholder="Search work items..."
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }));
                setCursorState(resetCursorHistory());
              }}
            />
          </div>
          <div className="filter-select">
            <Filter size={16} />
            <select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }));
                setCursorState(resetCursorHistory());
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <select
            aria-label="Filter by priority"
            value={filters.priority}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                priority: event.target.value,
              }));
              setCursorState(resetCursorHistory());
            }}
          >
            <option value="">All priorities</option>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by type"
            value={filters.type}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                type: event.target.value,
              }));
              setCursorState(resetCursorHistory());
            }}
          >
            <option value="">All types</option>
            {["TASK", "BUG", "INCIDENT", "REQUEST"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by team"
            value={filters.teamId}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                teamId: event.target.value,
              }));
              setCursorState(resetCursorHistory());
            }}
          >
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by assignee"
            value={filters.assigneeId}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                assigneeId: event.target.value,
              }));
              setCursorState(resetCursorHistory());
            }}
          >
            <option value="">All assignees</option>
            {currentUser?.id && (
              <option value={currentUser.id}>Assigned to me</option>
            )}
          </select>
          <select
            aria-label="Sort order"
            value={filters.sort}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                sort: event.target.value,
              }));
              setCursorState(resetCursorHistory());
            }}
          >
            <option value="createdAt">Newest created</option>
          </select>
          <select
            aria-label="Page size"
            value={filters.limit}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                limit: Number(event.target.value),
              }));
              setCursorState(resetCursorHistory());
            }}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </section>

        <section className="work-table-panel">
          <div className="table-heading">
            <div>
              <h2>All work items</h2>
              <p>Only items you are authorized to access are shown.</p>
            </div>
            <span>
              {loading
                ? "Loading…"
                : `${resultCount} on this page${hasMore ? ", more available" : ""}`}
            </span>
          </div>

          {loading ? (
            <div className="work-page-state">
              <LoaderCircle className="spinner" size={23} />
              Loading work items…
            </div>
          ) : items.length === 0 ? (
            <div className="work-page-state">
              <ClipboardList size={27} />
              <strong>No work items found</strong>
              <span>Try changing your search or filters.</span>
            </div>
          ) : (
            <div className="work-items-list">
              {items.map((item) => (
                <article className="work-row" key={item.id}>
                  <div className="work-row-main">
                    <div className="work-row-tags">
                      <span className="work-type">{item.type}</span>
                      <span
                        className={`priority priority-${item.priority.toLowerCase()}`}
                      >
                        {item.priority}
                      </span>
                      <span className={statusClass(item.status)}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <h3>{item.title}</h3>
                    {item.description && <p>{item.description}</p>}
                    <div className="work-row-meta">
                      <span>{item.team?.name ?? "Team"}</span>
                      <span>
                        {item.assignee?.name
                          ? `Assigned to ${item.assignee.name}`
                          : "Unassigned"}
                      </span>
                      <span>Version {item.version}</span>
                    </div>
                  </div>

                  <div className="work-row-actions">
                    {canManageTeam(item.teamId) && (
                      <>
                        {!item.assigneeId && item.status === "OPEN" && (
                          <button
                            className="secondary-button"
                            disabled={busyId === item.id}
                            onClick={() => void claimItem(item)}
                          >
                            <UserRoundCheck size={15} /> Claim
                          </button>
                        )}

                        <select
                          aria-label={`Change status for ${item.title}`}
                          value=""
                          disabled={busyId === item.id}
                          onChange={(event) => {
                            if (event.target.value) {
                              void changeStatus(item, event.target.value);
                            }
                          }}
                        >
                          <option value="">Change status…</option>
                          {STATUSES.filter((status) =>
                            canMoveTo(item, status),
                          ).map((status) => (
                            <option key={status} value={status}>
                              {statusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}

                    <button
                      className="secondary-button"
                      onClick={() => void showActivity(item)}
                    >
                      <Activity size={15} /> Activity
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="pagination">
            <button
              className="secondary-button"
              disabled={cursorState.history.length === 0 || loading}
              onClick={() =>
                setCursorState((current) => goToPreviousPage(current))
              }
            >
              Previous
            </button>
            <span>
              {cursorState.history.length === 0
                ? "First page"
                : `Page ${cursorState.history.length + 1}`}
            </span>
            <button
              className="secondary-button"
              disabled={!hasMore || !nextCursor || loading}
              onClick={() => {
                if (!nextCursor) {
                  return;
                }

                setCursorState((current) => goToNextPage(current, nextCursor));
              }}
            >
              Next
            </button>
          </div>
        </section>
      </div>

      {showCreate && canCreateWorkItems && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowCreate(false);
          }}
        >
          <section
            className="work-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW RECORD</p>
                <h2 id="create-title">Create work item</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setShowCreate(false)}
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={createItem}>
              <label htmlFor="item-title">Title *</label>
              <input
                id="item-title"
                minLength={3}
                maxLength={150}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to be done?"
              />

              <label htmlFor="item-description">Description</label>
              <textarea
                id="item-description"
                maxLength={5000}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context or acceptance criteria..."
              />

              <div className="modal-grid">
                <div>
                  <label htmlFor="item-type">Type</label>
                  <select
                    id="item-type"
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                  >
                    {["TASK", "BUG", "INCIDENT", "REQUEST"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-priority">Priority</label>
                  <select
                    id="item-priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label htmlFor="item-team">Team</label>
              <select
                id="item-team"
                required
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
              >
                <option value="">Select a team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {teams.length === 0 && (
                <p className="form-help">
                  Team choices couldn't be loaded. A team-list API endpoint is
                  needed to enable creation here.
                </p>
              )}

              <label htmlFor="item-due">Due date (optional)</label>
              <input
                id="item-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!teams.length}
                >
                  Create item
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activityItem && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActivityItem(null);
          }}
        >
          <section
            className="work-modal activity-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">AUDIT TRAIL</p>
                <h2 id="activity-title">Activity history</h2>
                <p className="form-help">{activityItem.title}</p>
              </div>
              <button
                className="icon-button"
                aria-label="Close activity"
                onClick={() => setActivityItem(null)}
              >
                <X size={17} />
              </button>
            </div>
            {activityLoading ? (
              <div className="work-page-state">
                <LoaderCircle className="spinner" size={22} />
                Loading activity…
              </div>
            ) : activity.length === 0 ? (
              <div className="work-page-state">
                No activity records returned.
              </div>
            ) : (
              <div className="activity-list">
                {activity.map((event) => (
                  <article className="activity-entry" key={event.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{event.action.replaceAll("_", " ")}</strong>
                      <p>
                        {event.actor?.name ??
                          event.actor?.email ??
                          "Team member"}
                      </p>
                      {event.fromStatus && event.toStatus && (
                        <p>
                          {statusLabel(event.fromStatus)} →{" "}
                          {statusLabel(event.toStatus)}
                        </p>
                      )}
                      <time>{new Date(event.createdAt).toLocaleString()}</time>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="comments-section">
              <div className="modal-heading">
                <div>
                  <p className="eyebrow">DISCUSSION</p>
                  <h3>Comments ({comments.length})</h3>
                </div>
              </div>

              {commentError && (
                <div className="work-alert" role="alert">
                  <ShieldAlert size={16} />
                  {commentError}
                </div>
              )}

              {commentsLoading ? (
                <div className="work-page-state">
                  <LoaderCircle className="spinner" size={20} />
                  Loading comments...
                </div>
              ) : comments.length === 0 ? (
                <p className="form-help">
                  No comments yet. Start the discussion.
                </p>
              ) : (
                <div className="comments-list">
                  {comments.map((comment) => (
                    <article className="comment-entry" key={comment.id}>
                      <strong>
                        {comment.author?.name ??
                          comment.author?.email ??
                          "Team member"}
                      </strong>

                      <time>
                        {new Date(comment.createdAt).toLocaleString()}
                      </time>

                      <p>{comment.content}</p>
                    </article>
                  ))}
                </div>
              )}

              <form onSubmit={submitComment} className="comment-form">
                <label htmlFor="work-item-comment">Add a comment</label>

                <textarea
                  id="work-item-comment"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Share an update or ask a question..."
                  maxLength={5000}
                  rows={3}
                  required
                />

                <div className="modal-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={commentSubmitting || !commentText.trim()}
                  >
                    {commentSubmitting ? "Posting..." : "Post comment"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
