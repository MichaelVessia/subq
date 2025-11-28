import alchemy from "alchemy";
import { Assets, D1Database, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("subq", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new CloudflareStateStore(scope),
});

const isProd = app.stage === "prod";

// D1 database (SQLite at the edge)
// primaryLocationHint: enam = Eastern North America (for NYC users)
export const db = await D1Database("db", {
  name: `subq-${app.stage}`,
  migrationsDir: "./packages/api/drizzle",
  adopt: true,
  primaryLocationHint: "enam",
});

// API Worker
export const api = await Worker("api", {
  name: `subq-api-${app.stage}`,
  entrypoint: "./packages/api/src/worker.ts",
  adopt: true,
  url: true,
  domains: isProd ? [{ domainName: "api.subq.vessia.net", adopt: true }] : [],
  compatibility: "node",
  bindings: {
    DB: db,
    BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET!),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
    // Axiom tracing
    OTEL_SERVICE_NAME: `subq-api-${app.stage}`,
    ...(process.env.AXIOM_API_TOKEN && { AXIOM_API_TOKEN: alchemy.secret(process.env.AXIOM_API_TOKEN) }),
    ...(process.env.AXIOM_DATASET && { AXIOM_DATASET: process.env.AXIOM_DATASET }),
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
  domains: isProd ? [{ domainName: "subq.vessia.net", adopt: true }] : [],
  bindings: {
    ASSETS: webAssets,
  },
});

console.log({
  api: api.url,
  web: web.url,
});

await app.finalize();
