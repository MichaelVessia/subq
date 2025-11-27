/**
 * Cloudflare Workers entrypoint for web frontend
 *
 * Serves static assets for the SPA.
 * Falls back to index.html for client-side routing.
 */

interface Env {
  // Assets binding - serves static files
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Try to serve the requested asset
    let response = await env.ASSETS.fetch(request)

    // If not found and not a file request (no extension), serve index.html for SPA routing
    if (response.status === 404 && !url.pathname.includes('.')) {
      const indexRequest = new Request(new URL('/', request.url), request)
      response = await env.ASSETS.fetch(indexRequest)
    }

    return response
  },
}
// force redeploy Thu Nov 27 09:42:17 AM EST 2025
