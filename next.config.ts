import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["linkedom", "@mozilla/readability"],
  poweredByHeader: false,
  // app independente de leitura e gravação de tags NFC (arquivos em public/nfc)
  async redirects() {
    return [
      { source: "/nfc", destination: "/nfc/index.html", permanent: false },
      { source: "/nfc/", destination: "/nfc/index.html", permanent: false },
    ];
  },
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
              `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              // imagens de propagandas cadastradas no painel vêm de endereços https
              "img-src 'self' data: blob: https:",
              // gravações tocadas a partir do próprio aparelho
              "media-src 'self' blob:",
              "font-src 'self'",
              // a IA do usuário é chamada direto do navegador somente para estes provedores
              `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} https://openrouter.ai https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://huggingface.co https://*.huggingface.co https://*.hf.co`,
              "worker-src 'self'",
              "manifest-src 'self'",
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
