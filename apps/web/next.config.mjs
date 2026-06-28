/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@interview/shared"],
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
};

export default nextConfig;
