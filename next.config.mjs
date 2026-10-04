/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained server bundle, so the runtime image doesn't ship
  // node_modules. Required by the Dockerfile.
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
