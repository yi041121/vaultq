import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone testing uses the PC's LAN address and temporary Cloudflare tunnels.
  // Next blocks dev resources from unknown origins by default.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.0.102", "localhost"],
  // The floating Next.js badge sits over the bottom-right mobile nav item.
  devIndicators: false,
};

export default nextConfig;
