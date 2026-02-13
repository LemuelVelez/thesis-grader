import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevents Next from picking a parent folder with another lockfile.
    root: process.cwd(),
  },
};

export default nextConfig;
