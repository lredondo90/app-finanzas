import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El extracto de Trade Republic se sube como PDF (unos pocos cientos de KB)
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
