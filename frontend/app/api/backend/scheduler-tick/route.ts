import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend";

async function parseBackendPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const detail = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    return { detail };
  }
}

export async function POST() {
  const schedulerToken = process.env.SCHEDULER_TOKEN;
  if (!schedulerToken) {
    return NextResponse.json(
      { detail: "Missing SCHEDULER_TOKEN env var in frontend server environment." },
      { status: 500 }
    );
  }

  try {
    const response = await backendFetch("/internal/scheduler-tick", {
      method: "POST",
      headers: {
        "X-Scheduler-Token": schedulerToken
      }
    });
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to run scheduler tick.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
