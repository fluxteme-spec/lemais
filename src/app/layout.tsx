import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider, StorageBanner } from "@/components/AppState";
import { Nav } from "@/components/Nav";
import { AccountProvider } from "@/components/Account";
import { AccountBanner } from "@/components/AccountBanner";
import { PwaRegister } from "@/components/Pwa";
import { Footer } from "@/components/Footer";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "LêMais", template: "%s · LêMais" },
  description: "Leitura guiada, experimentação de ritmo e teste opcional de compreensão.",
  applicationName: "LêMais",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#131a1e" },
  ],
};

// aplica o tema antes da pintura para evitar piscar
const themeScript = `try{var t=localStorage.getItem("lemais-theme");if(t==="claro"||t==="escuro")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#conteudo" className="sr-only-focusable btn btn-primary absolute left-2 top-2 z-50">
          Pular para o conteúdo
        </a>
        <AppStateProvider>
          <AccountProvider>
            <StorageBanner />
            <AccountBanner />
            <Nav />
            <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pb-12">
              {children}
            </main>
            <Footer />
            <PwaRegister />
          </AccountProvider>
        </AppStateProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
