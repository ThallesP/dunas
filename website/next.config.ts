import { createMDX } from "fumadocs-mdx/next"
import type { NextConfig } from "next"

const withMDX = createMDX()

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.123.155.61", "dev", "dev.tail8eb3d.ts.net"],
  images: { unoptimized: true },
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/dunes/static/:version/sand.js",
        destination: "https://us-assets.i.posthog.com/static/:version/posthog-recorder.js",
      },
      {
        source: "/dunes/static/sand.js",
        destination: "https://us-assets.i.posthog.com/static/posthog-recorder.js",
      },
      {
        source: "/dunes/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/dunes/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/dunes/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ]
  },
}

export default withMDX(nextConfig)
