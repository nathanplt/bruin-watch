import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend";

type Body = {
  course_number?: string;
  term?: string;
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const response = await backendFetch("/api/v1/check", {
      method: "POST",
      body: JSON.stringify({
        course_number: body.course_number,
        term: body.term
      })
    });

    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Check request failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
