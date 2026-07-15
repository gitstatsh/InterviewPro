import { execFileSync } from "node:child_process";

function resolveBuildCommit() {
  const configured = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.CF_PAGES_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.RENDER_GIT_COMMIT,
    process.env.SOURCE_VERSION,
    process.env.COBRA_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
  ]
    .map((value) => value?.trim())
    .find(Boolean);
  if (configured) return configured;
  try {
    const changes = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (changes) return "";

    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// This repository is public and COBRA requires production browser maps for
// source-line coverage. Set COBRA_SOURCE_MAPS=0 only for an explicit opt-out.
const cobraSourceMaps = process.env.COBRA_SOURCE_MAPS !== "0";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@interview/shared"],
  productionBrowserSourceMaps: cobraSourceMaps,
  env: {
    COBRA_BUILD_COMMIT_SHA: resolveBuildCommit(),
    COBRA_BUILD_SOURCE_MAPS: cobraSourceMaps ? "1" : "0",
  },
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
    const rules = [
      { source: "/api/auth/:path*", destination: `${apiUrl}/api/auth/:path*` },
      { source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` },
    ];
    // fallback: checked AFTER pages and dynamic routes, so Pages Router API
    // handlers (e.g. generate-from-jd with 300s timeout) win over these proxies.
    return { beforeFiles: [], afterFiles: [], fallback: rules };
  },
};

export default nextConfig;
