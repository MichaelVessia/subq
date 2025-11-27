import alchemy from "alchemy";
import { Assets, D1Database, Worker } from "alchemy/cloudflare";

const app = await alchemy("scalability", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
});

// D1 database (SQLite at the edge)
export const db = await D1Database("db", {
  name: `scalability-${app.stage}`,
  migrationsDir: "./packages/api/drizzle",
});

// API Worker
export const api = await Worker("api", {
  name: `scalability-api-${app.stage}`,
  entrypoint: "./packages/api/src/worker.ts",
  url: true,
  domains: ["api.glp.vessia.net"],
  compatibility: "node",
  bindings: {
    DB: db,
    BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET!),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
  },
});

// Static assets for web frontend
const webAssets = await Assets({
  path: "./packages/web/dist",
});

// Web frontend Worker (serves SPA)
export const web = await Worker("web", {
  name: `scalability-web-${app.stage}`,
  entrypoint: "./packages/web/src/worker.ts",
  url: true,
  domains: ["glp.vessia.net"],
  bindings: {
    ASSETS: webAssets,
  },
});

console.log({
  api: api.url,
  web: web.url,
});

await app.finalize();
