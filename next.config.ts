import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone testing uses the PC's LAN address and temporary Cloudflare tunnels.
  // Next blocks dev resources from unknown origins by default.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.0.102", "localhost"],
  // The floating Next.js badge sits over the bottom-right mobile nav item.
  devIndicators: false,
  // Sharp 0.35 ships its decoder and libvips as separate optional packages.
  // Next traces the JS wrappers but can omit libvips-cpp.so, which makes every
  // route that imports the image validator fail with ERR_DLOPEN_FAILED on
  // Vercel. Include the native files in the routes that can process images.
  outputFileTracingIncludes: {
    "/api/items": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/items/*": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/claims": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/claims/*": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/reports": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/reports/*": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/images/*": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/decode-barcode": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
  },
};

export default nextConfig;
