/**
 * `standalone` makes `.next/standalone` a self-contained server for the Docker image. What the
 * server reads from disk at run time — `output/analysis.json` — is copied by the Dockerfile, not
 * traced; see the ignore comment in `graph/usecase/getAnalysis.ts`.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
	output: 'standalone',
	reactStrictMode: true,
};

export default nextConfig;
