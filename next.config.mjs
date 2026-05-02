/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repoName = "CGP-EZ-GameCreator";

const nextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}/`,
        images: { unoptimized: true }
      }
    : {}),
  serverExternalPackages: ["better-sqlite3"],
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isGitHubPages ? "true" : "false",
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? `/${repoName}` : ""
  }
};

export default nextConfig;
