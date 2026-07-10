import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src 'self' ${supabaseOrigin} https://*.supabase.co`,
  "frame-src 'self' https://www.youtube.com https://player.vimeo.com https://www.loom.com https://drive.google.com",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          // Report-Only por enquanto: mede impacto sem bloquear nada.
          // Depois de revisar os relatórios (sem quebras), trocar para "Content-Security-Policy".
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        buffer: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
