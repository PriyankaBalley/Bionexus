/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    const api = (
      process.env.NEXT_PUBLIC_API_URL ||
      "https://bionexus-wyjz.onrender.com"
    ).replace(/\/+$/, "");

    return [
      {
        source: "/api/:path*",
        destination: `${api}/api/:path*`,
      },
      {
        source: "/docs",
        destination: `${api}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${api}/openapi.json`,
      },
    ];
  },
};

module.exports = nextConfig;