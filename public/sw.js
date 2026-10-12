/* LêMais — service worker.
 * - Arquivos estáticos do app: cache primeiro (são versionados pelo nome).
 * - Páginas: rede primeiro; sem conexão, usa a última versão salva da página
 *   (ou a página inicial), para que o conteúdo já salvo no aparelho continue acessível.
 * - Nunca guarda respostas de /api, /auth, /admin nem de outros domínios.
 */
const VERSION = "lemais-v3";
const SHELL = ["/", "/treinar", "/progresso", "/configuracoes", "/manifest.webmanifest", "/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("lemais-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(url) {
  if (url.origin !== self.location.origin) return false;
  return !/^\/(api|auth|admin|entrar|conta|s\/)/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const exact = await caches.match(req, { ignoreSearch: true });
          if (exact) return exact;
          // rotas dinâmicas (/ler/…, /preparar/…) usam o app já carregado
          const shell = await caches.match("/");
          return shell || new Response("Sem conexão", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
        }),
    );
  }
});
