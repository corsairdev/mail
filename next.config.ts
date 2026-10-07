import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "corsair", "isomorphic-dompurify"],
  allowedDevOrigins: ["127.0.0.1", "*.corsair.dev", "*.corsair.run"],
};

export default nextConfig;
