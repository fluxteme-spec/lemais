import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["linkedom", "@mozilla/readability"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js precisa de scripts inline para hidratação e para o tema sem piscar
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              // a IA do usuário é chamada direto do navegador somente para estes provedores
              "connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com",
              "form-action 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
