/**
 * Cloudflare Workers entrypoint for web frontend
 *
 * Serves static assets for the SPA.
 * The ASSETS binding is provided by Alchemy's Assets resource.
 */

interface Env {
  // Assets binding - serves static files
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Serve static assets
    return env.ASSETS.fetch(request)
  },
}
