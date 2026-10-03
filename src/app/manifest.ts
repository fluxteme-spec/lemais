import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LêMais — leitura, ritmo e compreensão",
    short_name: "LêMais",
    description: "Leitura guiada, experimentação de ritmo e teste opcional de compreensão.",
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1ec",
    theme_color: "#1c2b33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
