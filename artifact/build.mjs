// Gera a versão de teste do LêMais em uma única página HTML (React pelo cdnjs).
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const A = (p) => path.join(root, "artifact", p);

const result = await build({
  entryPoints: [A("main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  target: "es2020",
  jsx: "automatic",
  legalComments: "none",
  define: {
    "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_LEMAIS_PAGINA_UNICA: "1" }),
    "process.env.NODE_ENV": '"production"',
  },
  alias: {
    react: A("shims/react.js"),
    "react/jsx-runtime": A("shims/jsx-runtime.js"),
    "react-dom": A("shims/react-dom.js"),
    "react-dom/client": A("shims/react-dom-client.js"),
    "next/link": A("shims/next-link.tsx"),
    "next/navigation": A("shims/next-navigation.ts"),
    "@/lib/client/nav": A("shims/nav.ts"),
    "@/lib/supabase/browser": A("shims/supabase-browser.ts"),
    "@/components/Account": A("shims/account.tsx"),
    "@/components/Pwa": A("shims/pwa.tsx"),
    "@/components/SharePanel": A("SharePanelLite.tsx"),
    "@/components/AdSlot": A("shims/adslot.tsx"),
    "@/lib/ai/connection": A("shims/ai-connection.ts"),
    "@/lib/ai/providers": A("shims/ai-providers.ts"),
    "@/lib/ai/adapt": A("shims/ai-adapt.ts"),
    "@": path.join(root, "src"),
  },
  logLevel: "warning",
});
const js = result.outputFiles[0].text;

const cssIn = fs.readFileSync(A("app.css"), "utf8");
const css = (await postcss([tailwind({ base: A("") })]).process(cssIn, { from: A("app.css") })).css;

const html = `<title>LêMais</title>
<style>${css}</style>
<div id="app"><p style="padding:24px;font-family:system-ui">Carregando o LêMais…</p></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script>
`;
fs.mkdirSync(A("dist"), { recursive: true });
fs.writeFileSync(A("dist/lemais.html"), html);
console.log("ok", (html.length / 1024).toFixed(0), "KB");
