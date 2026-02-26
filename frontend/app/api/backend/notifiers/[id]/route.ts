import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend";

type Params = {
  params: {
    id: string;
  };
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

export async function PATCH(request: Request, { params }: Params) {
  try {
    const body = await request.json();
    const response = await backendFetch(`/api/v1/notifiers/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to update notifier.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const response = await backendFetch(`/api/v1/notifiers/${params.id}`, {
      method: "DELETE"
    });
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to delete notifier.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
