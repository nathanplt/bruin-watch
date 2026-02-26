"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

  return (
    <main className="page">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.8rem" }}>
        <div>
          <h1>{process.env.NEXT_PUBLIC_APP_NAME || "Enroll Notify"}</h1>
          <p className="muted">UCLA COM SCI availability checker + email/SMS notifier</p>
        </div>
        <form method="post" action="/api/auth/logout">
          <button className="secondary" type="submit">
            Sign Out
          </button>
        </form>
      </div>

      {banner ? <div className={`banner ${banner.type === "ok" ? "ok" : "error"}`}>{banner.text}</div> : null}

      <section className="grid">
        <article className="card">
          <h2>1) One-Time Status Check</h2>
          <form onSubmit={handleCheckStatus}>
            <label htmlFor="statusCourse">COM SCI Course</label>
            <input id="statusCourse" value={statusCourse} onChange={(e) => setStatusCourse(e.target.value)} required />

            <label htmlFor="statusTerm">Term</label>
            <input id="statusTerm" value={statusTerm} onChange={(e) => setStatusTerm(e.target.value)} required />

            <button style={{ marginTop: "0.8rem" }} disabled={statusLoading} type="submit">
              {statusLoading ? "Checking..." : "Check Status"}
            </button>
          </form>
        </article>

        <article className="card">
          <h2>2) Create Notifier</h2>
          <form onSubmit={handleCreateNotifier}>
            <label htmlFor="createCourse">COM SCI Course</label>
            <input id="createCourse" value={createCourse} onChange={(e) => setCreateCourse(e.target.value)} required />

            <label htmlFor="createTerm">Term</label>
            <input id="createTerm" value={createTerm} onChange={(e) => setCreateTerm(e.target.value)} required />

            <label htmlFor="createPhone">Alert To (email or phone, optional if backend default exists)</label>
            <input
              id="createPhone"
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
              placeholder="you@gmail.com"
            />

            <label htmlFor="createInterval">Interval (seconds)</label>
            <input
              id="createInterval"
              value={createInterval}
              onChange={(e) => setCreateInterval(e.target.value)}
              required
            />

            <button style={{ marginTop: "0.8rem" }} disabled={createLoading} type="submit">
              {createLoading ? "Creating..." : "Create Notifier"}
            </button>
          </form>
        </article>
      </section>

      {statusResult ? (
        <section className="card" style={{ marginTop: "1rem" }}>
          <h2>
            COM SCI {statusResult.course_number} - {statusResult.course_title}
          </h2>
          <p>
            <span className={`pill ${statusResult.enrollable ? "open" : "closed"}`}>
              Enrollable: {statusResult.enrollable ? "YES" : "NO"}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Open</th>
                <th>Enrollable Path</th>
              </tr>
            </thead>
            <tbody>
              {statusResult.sections.map((section) => (
                <tr key={`${section.kind}-${section.section}`}>
                  <td>{section.section}</td>
                  <td>{section.kind}</td>
                  <td>{section.status}</td>
                  <td>{section.is_open ? "YES" : "NO"}</td>
                  <td>{section.enrollable_path == null ? "n/a" : section.enrollable_path ? "YES" : "NO"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Notifier Jobs</h2>
          <div className="row">
            <button className="secondary" disabled={tickLoading} onClick={loadNotifiers} type="button">
              Refresh
            </button>
            <button disabled={tickLoading} onClick={runSchedulerTick} type="button">
              {tickLoading ? "Running..." : "Run Checks Now"}
            </button>
          </div>
        </div>
        <p className="muted">{notifiersLoading ? "Refreshing..." : `${sortedNotifiers.length} notifier(s)`}</p>
        <p className="muted">
          Local dev: backend auto-runs checks every 60s. Use Run Checks Now for immediate testing.
        </p>
        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Term</th>
              <th>Alert To</th>
              <th>Interval</th>
              <th>Active</th>
              <th>Last Checked</th>
              <th>Last Enrollable</th>
              <th>Latest Run</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedNotifiers.length === 0 ? (
              <tr>
                <td colSpan={9}>No notifiers yet.</td>
              </tr>
            ) : (
              sortedNotifiers.map((notifier) => (
                <tr key={notifier.id}>
                  <td>COM SCI {notifier.course_number}</td>
                  <td>{notifier.term}</td>
                  <td>{notifier.phone_to}</td>
                  <td>{notifier.interval_seconds}s</td>
                  <td>{notifier.active ? "YES" : "NO"}</td>
                  <td>{notifier.last_checked_at ?? "-"}</td>
                  <td>
                    {notifier.last_known_enrollable == null
                      ? "-"
                      : notifier.last_known_enrollable
                        ? "YES"
                        : "NO"}
                  </td>
                  <td>
                    {notifier.latest_run
                      ? `${notifier.latest_run.checked_at}${
                          notifier.latest_run.error_text
                            ? ` (ERR: ${notifier.latest_run.error_text})`
                            : notifier.latest_run.sms_sent
                              ? " (Alert sent)"
                              : ""
                        }`
                      : "-"}
                  </td>
                  <td>
                    <div className="row">
                      <button className="secondary" onClick={() => toggleNotifier(notifier)} type="button">
                        {notifier.active ? "Pause" : "Resume"}
                      </button>
                      <button className="danger" onClick={() => deleteNotifier(notifier)} type="button">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
