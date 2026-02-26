"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Section = {
  section: string;
  kind: "lecture" | "discussion";
  status: string;
  is_open: boolean;
  enrollable_path: boolean | null;
};

type CheckResponse = {
  checked_at: string;
  course_number: string;
  course_title: string;
  term: string;
  enrollable: boolean;
  sections: Section[];
};

type NotifierRun = {
  checked_at: string;
  is_enrollable: boolean | null;
  sms_sent: boolean;
  error_text: string | null;
  duration_ms: number;
};

type Notifier = {
  id: string;
  course_number: string;
  term: string;
  phone_to: string;
  interval_seconds: number;
  active: boolean;
  last_known_enrollable: boolean | null;
  last_checked_at: string | null;
  last_alerted_at: string | null;
  latest_run: NotifierRun | null;
};

type SchedulerTickResponse = {
  checked_at: string;
  total_active: number;
  due_count: number;
  processed_count: number;
  sms_sent_count: number;
  error_count: number;
  detail?: string;
};

export default function DashboardClient() {
  const router = useRouter();
  const [statusCourse, setStatusCourse] = useState("31");
  const [statusTerm, setStatusTerm] = useState("26S");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<CheckResponse | null>(null);

  const [notifiers, setNotifiers] = useState<Notifier[]>([]);
  const [notifiersLoading, setNotifiersLoading] = useState(false);

  const [createCourse, setCreateCourse] = useState("31");
  const [createTerm, setCreateTerm] = useState("26S");
  const [createPhone, setCreatePhone] = useState("");
  const [createInterval, setCreateInterval] = useState("60");
  const [createLoading, setCreateLoading] = useState(false);
  const [tickLoading, setTickLoading] = useState(false);

  const [banner, setBanner] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const sortedNotifiers = useMemo(
    () => [...notifiers].sort((a, b) => a.course_number.localeCompare(b.course_number)),
    [notifiers]
  );

  async function loadNotifiers() {
    setNotifiersLoading(true);
    try {
      const response = await fetch("/api/backend/notifiers", { cache: "no-store" });
      const payload = (await response.json()) as { notifiers: Notifier[]; detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to load notifiers.");
      }
      setNotifiers(payload.notifiers || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load notifiers.";
      setBanner({ type: "error", text: message });
    } finally {
      setNotifiersLoading(false);
    }
  }

  useEffect(() => {
    loadNotifiers();
  }, []);

  async function handleCheckStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusLoading(true);
    setBanner(null);

    try {
      const response = await fetch("/api/backend/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_number: statusCourse, term: statusTerm })
      });
      const payload = (await response.json()) as CheckResponse & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Status check failed.");
      }
      setStatusResult(payload);
      setBanner({ type: "ok", text: `Checked COM SCI ${payload.course_number}.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Status check failed.";
      setBanner({ type: "error", text: message });
      setStatusResult(null);
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleCreateNotifier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateLoading(true);
    setBanner(null);

    try {
      const interval = Number(createInterval);
      const response = await fetch("/api/backend/notifiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_number: createCourse,
          term: createTerm,
          phone_to: createPhone.trim() || undefined,
          interval_seconds: interval
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to create notifier.");
      }
      setBanner({ type: "ok", text: "Notifier created." });
      setCreatePhone("");
      await loadNotifiers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create notifier.";
      setBanner({ type: "error", text: message });
    } finally {
      setCreateLoading(false);
    }
  }

  async function toggleNotifier(notifier: Notifier) {
    setBanner(null);
    try {
      const response = await fetch(`/api/backend/notifiers/${notifier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !notifier.active })
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to update notifier.");
      }
      setBanner({ type: "ok", text: `Notifier ${notifier.id} updated.` });
      await loadNotifiers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update notifier.";
      setBanner({ type: "error", text: message });
    }
  }

  async function deleteNotifier(notifier: Notifier) {
    setBanner(null);
    try {
      const response = await fetch(`/api/backend/notifiers/${notifier.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to delete notifier.");
      }
      setBanner({ type: "ok", text: `Notifier ${notifier.id} deleted.` });
      await loadNotifiers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete notifier.";
      setBanner({ type: "error", text: message });
    }
  }

  async function runSchedulerTick() {
    setTickLoading(true);
    setBanner(null);
    try {
      const response = await fetch("/api/backend/scheduler-tick", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as SchedulerTickResponse;
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to run scheduler tick.");
      }
      setBanner({
        type: "ok",
        text: `Scheduler tick complete: due=${payload.due_count}, processed=${payload.processed_count}, sms=${payload.sms_sent_count}, errors=${payload.error_count}.`
      });
      await loadNotifiers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to run scheduler tick.";
      setBanner({ type: "error", text: message });
    } finally {
      setTickLoading(false);
    }
  }

  async function handleLogout() {
    setBanner(null);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <main className="page">
      <div className="header-section">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>{process.env.NEXT_PUBLIC_APP_NAME || "BruinWatch"}</h1>
            <p className="muted">UCLA COM SCI enrollment tracker with instant alerts</p>
          </div>
          <button className="secondary" type="button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>

      {banner ? <div className={`banner ${banner.type === "ok" ? "ok" : "error"}`}>{banner.text}</div> : null}

      <section className="grid">
        <article className="card">
          <div style={{ marginBottom: "1.5rem" }}>
            <h2>Quick Status Check</h2>
            <p className="muted">
              Check course availability once without creating a notifier
            </p>
          </div>
          <form onSubmit={handleCheckStatus}>
            <label htmlFor="statusCourse">Course Number</label>
            <input
              id="statusCourse"
              value={statusCourse}
              onChange={(e) => setStatusCourse(e.target.value)}
              placeholder="31"
              required
            />

            <label htmlFor="statusTerm">Term</label>
            <input
              id="statusTerm"
              value={statusTerm}
              onChange={(e) => setStatusTerm(e.target.value)}
              placeholder="26S"
              required
            />

            <button style={{ width: "100%", justifyContent: "center" }} disabled={statusLoading} type="submit">
              {statusLoading && <span className="spinner" />}
              {statusLoading ? "Checking..." : "Check Status"}
            </button>
          </form>
        </article>

        <article className="card">
          <div style={{ marginBottom: "1.5rem" }}>
            <h2>Create Alert Notifier</h2>
            <p className="muted">
              Get notified when a course becomes available
            </p>
          </div>
          <form onSubmit={handleCreateNotifier}>
            <label htmlFor="createCourse">Course Number</label>
            <input
              id="createCourse"
              value={createCourse}
              onChange={(e) => setCreateCourse(e.target.value)}
              placeholder="31"
              required
            />

            <label htmlFor="createTerm">Term</label>
            <input
              id="createTerm"
              value={createTerm}
              onChange={(e) => setCreateTerm(e.target.value)}
              placeholder="26S"
              required
            />

            <label htmlFor="createPhone">
              Alert Destination
              <span className="muted" style={{ fontWeight: 400, fontSize: "0.8125rem", marginLeft: "0.5rem" }}>
                (Optional)
              </span>
            </label>
            <input
              id="createPhone"
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
              placeholder="email@example.com or +15551234567"
            />

            <label htmlFor="createInterval">Check Interval (seconds)</label>
            <input
              id="createInterval"
              type="number"
              min="15"
              max="3600"
              value={createInterval}
              onChange={(e) => setCreateInterval(e.target.value)}
              placeholder="60"
              required
            />

            <button style={{ width: "100%", justifyContent: "center" }} disabled={createLoading} type="submit">
              {createLoading && <span className="spinner" />}
              {createLoading ? "Creating..." : "Create Notifier"}
            </button>
          </form>
        </article>
      </section>

      {statusResult ? (
        <section className="card" style={{ marginTop: "2rem" }}>
          <div className="section-header">
            <div>
              <h3 style={{ margin: 0, textTransform: "none", fontSize: "0.875rem" }}>Course Details</h3>
              <h2 style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>
                COM SCI {statusResult.course_number}
              </h2>
              <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem" }}>
                {statusResult.course_title}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
              <span className={`pill ${statusResult.enrollable ? "open" : "closed"}`}>
                {statusResult.enrollable ? "Enrollable" : "Not Available"}
              </span>
              <span className="muted" style={{ fontSize: "0.8125rem" }}>
                {new Date(statusResult.checked_at).toLocaleString()}
              </span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>Type</th>
                <th>Status</th>
                <th>Available</th>
                <th>Enrollable Path</th>
              </tr>
            </thead>
            <tbody>
              {statusResult.sections.map((section) => (
                <tr key={`${section.kind}-${section.section}`}>
                  <td style={{ fontWeight: 600 }}>{section.section}</td>
                  <td style={{ textTransform: "capitalize" }}>{section.kind}</td>
                  <td>{section.status}</td>
                  <td>
                    <span style={{ color: section.is_open ? "var(--success)" : "var(--accent)", fontWeight: 500 }}>
                      {section.is_open ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    {section.enrollable_path == null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span style={{ color: section.enrollable_path ? "var(--success)" : "var(--accent)", fontWeight: 500 }}>
                        {section.enrollable_path ? "Yes" : "No"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: "2rem" }}>
        <div className="section-header">
          <div>
            <h3 style={{ margin: 0, textTransform: "none", fontSize: "0.875rem" }}>Monitoring</h3>
            <h2 style={{ margin: "0.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>Active Notifiers</h2>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {notifiersLoading ? "Refreshing..." : `${sortedNotifiers.length} ${sortedNotifiers.length === 1 ? "notifier" : "notifiers"}`}
            </p>
          </div>
          <div className="row">
            <button className="secondary" disabled={tickLoading || notifiersLoading} onClick={loadNotifiers} type="button">
              {notifiersLoading && <span className="spinner" />}
              {notifiersLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button disabled={tickLoading || notifiersLoading} onClick={runSchedulerTick} type="button">
              {tickLoading && <span className="spinner" />}
              {tickLoading ? "Running..." : "Run Checks Now"}
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Term</th>
                <th>Alert To</th>
                <th>Interval</th>
                <th>Status</th>
                <th>Last Check</th>
                <th>Enrollable</th>
                <th>Latest Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedNotifiers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>
                    No notifiers created yet. Use the form above to create your first one.
                  </td>
                </tr>
              ) : (
                sortedNotifiers.map((notifier) => (
                  <tr key={notifier.id}>
                    <td style={{ fontWeight: 600 }}>COM SCI {notifier.course_number}</td>
                    <td>{notifier.term}</td>
                    <td style={{ fontSize: "0.85rem" }}>{notifier.phone_to}</td>
                    <td>{notifier.interval_seconds}s</td>
                    <td>
                      <span className={`status-badge ${notifier.active ? "active" : "inactive"}`}>
                        {notifier.active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {notifier.last_checked_at ? new Date(notifier.last_checked_at).toLocaleString() : <span className="muted">—</span>}
                    </td>
                    <td>
                      {notifier.last_known_enrollable == null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span style={{ color: notifier.last_known_enrollable ? "var(--success)" : "var(--accent)", fontWeight: 500 }}>
                          {notifier.last_known_enrollable ? "Yes" : "No"}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {notifier.latest_run ? (
                        <div>
                          {notifier.latest_run.error_text ? (
                            <span style={{ color: "var(--accent)", fontWeight: 500 }}>Error: {notifier.latest_run.error_text.substring(0, 30)}...</span>
                          ) : notifier.latest_run.sms_sent ? (
                            <span style={{ color: "var(--success)", fontWeight: 500 }}>Alert sent</span>
                          ) : (
                            <span className="muted">Checked ({notifier.latest_run.duration_ms}ms)</span>
                          )}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: "0.5rem" }}>
                        <button
                          className="secondary"
                          onClick={() => toggleNotifier(notifier)}
                          type="button"
                          style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
                        >
                          {notifier.active ? "Pause" : "Resume"}
                        </button>
                        <button
                          className="danger"
                          onClick={() => deleteNotifier(notifier)}
                          type="button"
                          style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
