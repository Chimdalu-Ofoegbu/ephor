import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env into the server process (server-side only) so API routes
// can sign owner actions with DEPLOYER_PRIVATE_KEY without duplicating secrets.
// Never exposed to the client — only NEXT_PUBLIC_* vars are inlined into the bundle.
try {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no root .env — live actions will report "no signer configured" */
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ephor/shared"],
};

export default nextConfig;
