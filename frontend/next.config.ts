import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker multi-stage build (copies only necessary files)
  output: "standalone",

  // Enable React Compiler (experimental, already in your setup)
  reactCompiler: true,

  // Allow images from any HTTPS source (for document previews etc.)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Forward API requests to the backend in production
  // In local dev this is handled by nginx; in Vercel it goes via vercel.json rewrites.
  async rewrites() {
    // Only active when running `next dev` without nginx in front
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;