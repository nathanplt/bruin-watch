function buildCandidateUrls(baseUrl: string, path: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid BACKEND_BASE_URL: "${baseUrl}"`);
  }

  const candidates = [new URL(path, parsed).toString()];
  if (parsed.hostname === "localhost") {
    const fallback = new URL(parsed.toString());
    fallback.hostname = "127.0.0.1";
    candidates.push(new URL(path, fallback).toString());
  }

  return [...new Set(candidates)];
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = process.env.BACKEND_BASE_URL;
  const apiKey = process.env.BACKEND_API_KEY;

  if (!baseUrl) {
    throw new Error("Missing BACKEND_BASE_URL env var.");
  }
  if (!apiKey) {
    throw new Error("Missing BACKEND_API_KEY env var.");
  }

  const headers = new Headers(init?.headers);
  headers.set("X-API-Key", apiKey);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const errors: string[] = [];
  for (const url of buildCandidateUrls(baseUrl, path)) {
    try {
      return await fetch(url, {
        ...init,
        headers,
        cache: "no-store"
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(`${url}: ${detail}`);
    }
  }

  throw new Error(
    `Cannot reach backend API. Check BACKEND_BASE_URL and ensure uvicorn is running. Tried: ${errors.join(
      " | "
    )}`
  );
}
