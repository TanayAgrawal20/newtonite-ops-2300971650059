import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";

type WorkItem = {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  priority: string;
  status: string;
  dueDate?: string | null;
  updatedAt?: string;
  team?: { name?: string };
  assignee?: { name?: string; email?: string } | null;
};

type DashboardData = {
  assignedToMe: WorkItem[];
  unassignedUrgent: WorkItem[];
  awaitingMyApproval: WorkItem[];
};

const emptyDashboard: DashboardData = {
  assignedToMe: [],
  unassignedUrgent: [],
  awaitingMyApproval: [],
};

function priorityClass(priority: string) {
  return `priority priority-${priority.toLowerCase()}`;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function WorkItemCard({ item }: { item: WorkItem }) {
  return (
    <article className="work-card">
      <div className="work-card-top">
        <span className="work-type">{item.type}</span>
        <span className={priorityClass(item.priority)}>{item.priority}</span>
      </div>

      <h3>{item.title}</h3>

      {item.description && (
        <p className="work-description">{item.description}</p>
      )}

      <div className="work-meta">
        <span>
          <CircleDot size={14} />
          {formatStatus(item.status)}
        </span>
        {item.team?.name && <span>{item.team.name}</span>}
      </div>

      {item.dueDate && (
        <div className="due-date">
          <Clock3 size={14} />
          Due {new Date(item.dueDate).toLocaleDateString()}
        </div>
      )}
    </article>
  );
}

function WorkSection({
  title,
  subtitle,
  icon,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: WorkItem[];
  emptyText: string;
}) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div className="section-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="item-count">{items.length}</span>
      </div>

      <div className="work-list">
        {items.length > 0 ? (
          items.map((item) => <WorkItemCard key={item.id} item={item} />)
        ) : (
          <div className="empty-state">
            <CheckCircle2 size={23} />
            <p>{emptyText}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/work-items/dashboard");
      const result = response.data?.data ?? {};

      setData({
        assignedToMe: result.assignedToMe ?? [],
        unassignedUrgent: result.unassignedUrgent ?? [],
        awaitingMyApproval: result.awaitingMyApproval ?? [],
      });
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;

      if (status === 401) {
        localStorage.removeItem("accessToken");
        navigate("/login", { replace: true });
        return;
      }

      setError(
        "We couldn't load your work items. Check the API connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!localStorage.getItem("accessToken")) {
      navigate("/login", { replace: true });
      return;
    }

    void loadDashboard();
  }, [navigate, loadDashboard]);

  function logout() {
    localStorage.removeItem("accessToken");
    navigate("/login", { replace: true });
  }

  const total =
    data.assignedToMe.length +
    data.unassignedUrgent.length +
    data.awaitingMyApproval.length;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <div className="dashboard-brand-icon">
            <ClipboardList size={23} />
          </div>
          <div>
            <strong>Newtonite Ops</strong>
            <span>Internal Operations</span>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => navigate("/work-items")}
          >
            <ClipboardList size={17} />
            <span>Work Items</span>
            <ArrowRight size={15} />
          </button>

          <button
            className="icon-button"
            onClick={() => void loadDashboard()}
            title="Refresh dashboard"
          >
            <RefreshCw size={17} />
            <span>Refresh</span>
          </button>

          <button className="icon-button" onClick={logout}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">WORKSPACE OVERVIEW</p>
            <h1>Your work dashboard</h1>
            <p className="welcome-subtitle">
              Keep track of assignments, urgent work, and pending approvals.
            </p>
          </div>
          <div className="overview-total">
            <Activity size={19} />
            <div>
              <strong>{loading ? "—" : total}</strong>
              <span>Items across sections</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="dashboard-error" role="alert">
            <AlertCircle size={19} />
            <span>{error}</span>
            <button onClick={() => void loadDashboard()}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="dashboard-loading">
            <RefreshCw className="spinner" size={24} />
            <p>Loading your dashboard…</p>
          </div>
        ) : (
          <div className="dashboard-sections">
            <WorkSection
              title="Assigned to Me"
              subtitle="Work items assigned to you"
              icon={<ClipboardList size={19} />}
              items={data.assignedToMe}
              emptyText="Nothing assigned to you right now."
            />

            <WorkSection
              title="Unassigned Urgent"
              subtitle="Urgent work that needs an owner"
              icon={<AlertCircle size={19} />}
              items={data.unassignedUrgent}
              emptyText="No unassigned urgent items. Great!"
            />

            <WorkSection
              title="Awaiting My Approval"
              subtitle="Work items waiting for your review"
              icon={<ShieldCheck size={19} />}
              items={data.awaitingMyApproval}
              emptyText="No approvals waiting for you."
            />
          </div>
        )}
      </div>
    </main>
  );
}
