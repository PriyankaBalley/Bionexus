/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "https://bionexus-wyjz.onrender.com/";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      // FastAPI serves its interactive documentation at /docs (and the schema
      // it reads at /openapi.json) on the backend host. Without these two
      // rewrites the "API documentation" link renders a Next.js 404, because
      // only /api/* was being proxied.
      { source: "/docs", destination: `${api}/docs` },
      { source: "/openapi.json", destination: `${api}/openapi.json` },
    ];
  },
};
module.exports = nextConfig;
