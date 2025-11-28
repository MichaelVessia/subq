# SubQ

Health tracking application for subcutaneous injection management.

## Links

- **Production**: https://subq.vessia.net
- **Axiom Traces**: https://app.axiom.co/vessia-9stl/dashboards/otel.traces.subq-traces
- **Cloudflare Dashboard**: https://dash.cloudflare.com

## Development

```bash
# Install dependencies
bun install

# Start local dev server (API + Web)
bun run dev

# Start Jaeger for local tracing
docker compose -f packages/api/docker-compose.yml up -d
# Jaeger UI: http://localhost:16686

# Run tests
bun run test

# Run e2e tests
bun run --filter @subq/web test:e2e
```

## Deployment

```bash
# Deploy to prod
bun run alchemy.run.ts --stage prod

# Seed prod database
bun run scripts/seed-prod.ts
```
