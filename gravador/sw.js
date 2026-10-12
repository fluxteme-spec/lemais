// Deixa o app abrir sem internet. Os modelos de IA são guardados à parte pela biblioteca.
const VERSAO = 'gravador-v1';
const BASE = ['./', './index.html', './app.js', './worker.js', './resumo.js', './modelos.js', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('gravador-') && k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Biblioteca de IA e motor ONNX (versões fixas): guarda na primeira vez.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(VERSAO + '-cdn').then(async (c) => {
        const r = await c.match(e.request);
        if (r) return r;
        const resp = await fetch(e.request);
        if (resp.ok) c.put(e.request, resp.clone());
        return resp;
      })
    );
    return;
  }
  // Arquivos do app: rede primeiro (pega atualizações), cache se estiver offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp.ok) caches.open(VERSAO).then((c) => c.put(e.request, resp.clone()));
          return resp;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  }
});
