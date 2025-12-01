# SubQ

Health tracking application for subcutaneous injection management.

## Links

- **Production**: https://subq.vessia.net
- **Fly Dashboard**: https://fly.io/apps/subq

## Development

```bash
# Install dependencies
bun install

# Start local dev server (API + Web + Jaeger)
bun run dev

# Jaeger UI: http://localhost:16686

# Run tests
bun run test

# Run e2e tests
bun run test:e2e
```

## Deployment

Deploys automatically on push to `master` via GitHub Actions.

```bash
# Manual deploy
fly deploy

# Set secrets (first time)
fly secrets set BETTER_AUTH_SECRET="your-secret-here"

# Create volume (first time)
fly volumes create subq_data --region ewr --size 1
```

## Local Production Testing

```bash
# Build and run full stack locally with Docker
docker compose up --build

# App: http://localhost:8080
# Jaeger: http://localhost:16686
```
