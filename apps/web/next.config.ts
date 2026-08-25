import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@uaw/types", "@uaw/provider-core"],
};

export default nextConfig;
