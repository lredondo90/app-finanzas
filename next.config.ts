import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // para importar el Excel
  },
  serverExternalPackages: ["exceljs", "unpdf"],
};

export default nextConfig;
