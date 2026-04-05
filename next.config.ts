import type { NextConfig } from "next";

const isExport = process.env.EXPORT_MODE === "true";
const repoName = "health-card";

const nextConfig: NextConfig = {
  ...(isExport
    ? {
        output: "export",
        trailingSlash: true,
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}/`,
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;
