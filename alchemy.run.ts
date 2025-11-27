import alchemy from "alchemy";
import { Assets, D1Database, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("subq", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new CloudflareStateStore(scope),
});

// D1 database (SQLite at the edge)
export const db = await D1Database("db", {
  name: `subq-${app.stage}`,
  migrationsDir: "./packages/api/drizzle",
  adopt: true,
});

// API Worker
export const api = await Worker("api", {
  name: `subq-api-${app.stage}`,
  entrypoint: "./packages/api/src/worker.ts",
  adopt: true,
  url: true,
  domains: [{ domainName: "api.subq.vessia.net", adopt: true }],
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
  name: `subq-web-${app.stage}`,
  entrypoint: "./packages/web/src/worker.ts",
  adopt: true,
  url: true,
  domains: [{ domainName: "subq.vessia.net", adopt: true }],
  bindings: {
    ASSETS: webAssets,
  },
});

console.log({
  api: api.url,
  web: web.url,
});

await app.finalize();
