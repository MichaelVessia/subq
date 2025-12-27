// Configuration for the TUI

export interface Config {
  apiUrl: string
}

export function getConfig(): Config {
  return {
    apiUrl: process.env.SUBQ_API_URL ?? 'https://subq.vessia.net',
  }
}
