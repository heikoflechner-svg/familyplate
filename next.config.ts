import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  generateBuildId: async () => Date.now().toString(),
};

export default nextConfig;
