/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by the Dockerfile, which copies .next/standalone and runs server.js.
  output: "standalone",

  async rewrites() {
    // Local dev convenience ONLY: set API_PROXY_TARGET in your shell / .env.local
    // (e.g. API_PROXY_TARGET=http://localhost:8000) and `next dev` will proxy
    // same-origin /api/* requests to the FastAPI backend, so no CORS setup is
    // needed. This variable is intentionally never set anywhere in this repo;
    // in production nginx routes /api to the backend instead.
    const target = process.env.API_PROXY_TARGET;
    if (!target) {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
