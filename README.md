# SubQ

Health tracking application for subcutaneous injection management.

## CLI

A command-line interface is available for managing injections, weight logs, and schedules.

### Installation

Download the latest binary for your platform from [Releases](https://github.com/MichaelVessia/subq/releases/tag/cli-latest):

```bash
# macOS Apple Silicon
curl -L https://github.com/MichaelVessia/subq/releases/download/cli-latest/subq-darwin-arm64 -o subq
chmod +x subq
sudo mv subq /usr/local/bin/

# macOS Intel
curl -L https://github.com/MichaelVessia/subq/releases/download/cli-latest/subq-darwin-x64 -o subq
chmod +x subq
sudo mv subq /usr/local/bin/

# Linux x64
curl -L https://github.com/MichaelVessia/subq/releases/download/cli-latest/subq-linux-x64 -o subq
chmod +x subq
sudo mv subq /usr/local/bin/

# Linux ARM64
curl -L https://github.com/MichaelVessia/subq/releases/download/cli-latest/subq-linux-arm64 -o subq
chmod +x subq
sudo mv subq /usr/local/bin/
```

### Usage

```bash
# Login first
subq auth login

# See all commands
subq --help
```

The CLI supports JSON output (`--json`) for easy integration with scripts and AI agents.

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
