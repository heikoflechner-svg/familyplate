import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  generateBuildId: async () => Date.now().toString(),
  reactStrictMode: false,
  headers: async () => [
    {
      // Ensure sw.js is never aggressively cached so browsers always
      // detect new versions on the next page load.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
    },
  ],
};

export default nextConfig;
