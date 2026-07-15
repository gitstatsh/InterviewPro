/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@interview/shared"],
  // Use only on a commit-matched COBRA staging deployment. Publishing browser
  // source maps is a deliberate security tradeoff because they expose source.
  productionBrowserSourceMaps: process.env.COBRA_SOURCE_MAPS === "1",
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
