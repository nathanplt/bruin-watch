import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend";

type CreateBody = {
  course_number?: string;
  term?: string;
  phone_to?: string;
  interval_seconds?: number;
};

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

export async function GET() {
  try {
    const response = await backendFetch("/api/v1/notifiers", { method: "GET" });
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to fetch notifiers.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBody;
    const response = await backendFetch("/api/v1/notifiers", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to create notifier.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
