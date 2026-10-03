import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { isBlockedAddress } from "@/lib/extract/ssrf";
import { safeFetch, validateUrl, ExtractError } from "@/lib/extract/fetch";
import { extractArticle } from "@/lib/extract/parse";

const fixture = (n: string) => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8");

describe("bloqueio de endereços (SSRF)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "ff02::1",
    "isto-nao-e-ip",
  ])("bloqueia %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("permite %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

describe("validação de URL", () => {
  const bad = ["ftp://exemplo.com", "javascript:alert(1)", "http://user:pass@exemplo.com/", "http://exemplo.com:8080/", "nada", "file:///etc/passwd"];
  it.each(bad)("rejeita %s", (u) => expect(() => validateUrl(u)).toThrow(ExtractError));

  it("rejeita formas alternativas de loopback na conexão", async () => {
    for (const u of ["http://127.0.0.1/", "http://2130706433/", "http://0x7f.0.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://localhost/"]) {
      await expect(safeFetch(u)).rejects.toMatchObject({ code: "forbidden_destination" });
    }
  });
});

describe("download seguro (servidor local de testes)", () => {
  let server: http.Server;
  let base: string;
  let port: number;
  // libera SOMENTE o loopback do servidor de testes
  const allowTest = (ip: string) => ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const u = req.url ?? "/";
      if (req.headers.cookie || req.headers.authorization) {
        res.writeHead(500).end("credenciais vazaram");
        return;
      }
      if (u === "/artigo") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fixture("article.html"));
      } else if (u === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }).end(zlib.gzipSync(fixture("article.html")));
      } else if (u.startsWith("/redir/")) {
        const n = Number(u.split("/")[2]);
        res.writeHead(302, { location: n > 0 ? `/redir/${n - 1}` : "/artigo" }).end();
      } else if (u === "/para-metadados") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" }).end();
      } else if (u === "/pdf") {
        res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF");
      } else if (u === "/enorme") {
        // sem Content-Length e com corpo maior que o limite
        res.writeHead(200, { "content-type": "text/html" });
        const chunk = "<p>" + "x".repeat(64 * 1024) + "</p>";
        let i = 0;
        const write = () => {
          while (i++ < 200) if (!res.write(chunk)) return res.once("drain", write);
          res.end();
        };
        write();
      } else if (u === "/bomba") {
        // 50 MB descomprimidos em poucos KB
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }).end(zlib.gzipSync(Buffer.alloc(50 * 1024 * 1024, 32)));
      } else if (u === "/lento") {
        res.writeHead(200, { "content-type": "text/html" });
        res.write("<p>");
      } else if (u === "/proibido") {
        res.writeHead(403).end();
      } else if (u === "/sumiu") {
        res.writeHead(404).end();
      } else if (u === "/assinante") {
        res.writeHead(402).end();
      } else res.writeHead(500).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });
  const opts = () => ({ isAllowedAddress: allowTest, extraPorts: [port] });

  it("baixa HTML e não envia cookies/credenciais", async () => {
    const p = await safeFetch(`${base}/artigo`, opts());
    expect(p.html).toContain("Pedra Alta");
  });

  it("descomprime gzip", async () => {
    const p = await safeFetch(`${base}/gzip`, opts());
    expect(p.html).toContain("Pedra Alta");
  });

  it("segue até 3 redirecionamentos e informa URL final", async () => {
    const p = await safeFetch(`${base}/redir/2`, opts());
    expect(p.finalUrl).toBe(`${base}/artigo`);
    await expect(safeFetch(`${base}/redir/3`, opts())).rejects.toMatchObject({ code: "unavailable" });
  });

  it("revalida destino a cada redirecionamento", async () => {
    await expect(safeFetch(`${base}/para-metadados`, opts())).rejects.toMatchObject({ code: "forbidden_destination" });
  });

  it("rejeita tipo não suportado", async () => {
    await expect(safeFetch(`${base}/pdf`, opts())).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("interrompe resposta excessiva sem Content-Length", async () => {
    await expect(safeFetch(`${base}/enorme`, opts())).rejects.toMatchObject({ code: "too_large" });
  });

  it("interrompe bomba de descompressão", async () => {
    await expect(safeFetch(`${base}/bomba`, opts())).rejects.toMatchObject({ code: "too_large" });
  });

  it("respeita o tempo limite total", async () => {
    await expect(safeFetch(`${base}/lento`, { ...opts(), timeoutMs: 300 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("diferencia bloqueio, indisponível e restrição", async () => {
    await expect(safeFetch(`${base}/proibido`, opts())).rejects.toMatchObject({ code: "blocked" });
    await expect(safeFetch(`${base}/sumiu`, opts())).rejects.toMatchObject({ code: "unavailable" });
    await expect(safeFetch(`${base}/assinante`, opts())).rejects.toMatchObject({ code: "possibly_restricted" });
  });

  it("bloqueia loopback por padrão mesmo com a porta liberada", async () => {
    await expect(safeFetch(`${base}/artigo`, { extraPorts: [port] })).rejects.toMatchObject({ code: "forbidden_destination" });
  });
});

describe("extração editorial", () => {
  it("extrai metadados e parágrafos, sem navegação, anúncios ou comentários", () => {
    const a = extractArticle(fixture("article.html"), "https://jornal.exemplo/materia");
    expect(a.title).toContain("Pedra Alta");
    expect(a.author).toContain("Marina Couto");
    expect(a.publishedAt).toBe("2026-03-14T13:00:00.000Z");
    expect(a.siteName).toBe("Jornal do Vale");
    const all = a.blocks.map((b) => b.text).join("\n");
    expect(all).toContain("R$ 4,2 milhões"); // preço mantido
    expect(all).toContain("saiba mais"); // parágrafo com link mantido
    expect(all).not.toContain("Promoção imperdível");
    expect(all).not.toContain("usuário123");
    expect(all).not.toContain("Todos os direitos");
    expect(all).not.toContain("document.cookie");
    expect(a.blocks.some((b) => b.type === "heading" && b.text === "Próximos passos")).toBe(true);
    expect(a.wordCount).toBeGreaterThan(200);
    expect(a.possiblyRestricted).toBe(false);
  });

  it("não inventa campos ausentes", () => {
    const html = `<html><body><article>${"<p>Um parágrafo razoavelmente longo sobre um tema qualquer, escrito para testes de extração editorial sem metadados.</p>".repeat(8)}</article></body></html>`;
    const a = extractArticle(html);
    expect(a.author).toBeNull();
    expect(a.publishedAt).toBeNull();
    expect(a.subtitle).toBeNull();
    expect(a.warnings.length).toBeGreaterThan(0); // curto → aviso de possível incompletude
  });

  it("indica possível restrição só com sinal explícito", () => {
    expect(() => extractArticle(fixture("paywall.html"))).toThrow(expect.objectContaining({ code: "possibly_restricted" }));
    expect(() => extractArticle(fixture("nocontent.html"))).toThrow(expect.objectContaining({ code: "no_content" }));
  });
});
