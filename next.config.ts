import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  generateBuildId: async () => Date.now().toString(),
  reactStrictMode: false,
};

export default nextConfig;
