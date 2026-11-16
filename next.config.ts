import type { NextConfig } from "next";

/**
 * GitHub Pages serves the site from https://USERNAME.github.io/REPOSITORY/,
 * so every route and asset must be prefixed with the repository path.
 * The deploy workflow sets NEXT_PUBLIC_BASE_PATH (e.g. "/TurNaer");
 * locally it is empty and the app is served from "/".
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
