import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function loadRepoEnvIntoProcess() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const envPaths = [path.resolve(configDir, ".env"), path.resolve(configDir, "../.env")];

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }
      const [rawKey, ...rawValueParts] = line.split("=");
      const key = rawKey.trim();
      const value = rawValueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadRepoEnvIntoProcess();

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
