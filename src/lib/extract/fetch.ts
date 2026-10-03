/**
 * Download seguro de páginas HTML para extração.
 * - só http/https, sem credenciais na URL, portas restritas;
 * - validação de IP na conexão (lookup seguro) e para IPs literais;
 * - cada redirecionamento é revalidado; máximo configurável;
 * - nenhum cookie, credencial ou cabeçalho de autenticação é enviado;
 * - limite de tempo total e de bytes DESCOMPRIMIDOS (não confia em Content-Length);
 * - nenhum sub-recurso é buscado.
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { EXTRACTION } from "@/lib/config";
import { BlockedDestinationError, isBlockedAddress, makeSafeLookup } from "./ssrf";

export type ExtractErrorCode =
  | "invalid_url"
  | "forbidden_destination"
  | "timeout"
  | "unavailable"
  | "unsupported_type"
  | "too_large"
  | "blocked"
  | "possibly_restricted"
  | "no_content"
  | "rate_limited"
  | "internal";

export class ExtractError extends Error {
  constructor(public code: ExtractErrorCode, message?: string, public httpStatus?: number) {
    super(message ?? code);
    this.name = "ExtractError";
  }
}

export interface FetchedPage {
  originalUrl: string;
  finalUrl: string;
  html: string;
  contentType: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Somente para testes: permite endereços específicos (ex.: servidor local de testes). */
  isAllowedAddress?: (ip: string) => boolean;
  /** Somente para testes: portas extras permitidas. */
  extraPorts?: number[];
}

export function validateUrl(raw: string, extraPorts: number[] = []): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new ExtractError("invalid_url", "URL inválida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ExtractError("invalid_url", "Apenas links http ou https são aceitos.");
  if (u.username || u.password) throw new ExtractError("invalid_url", "Links com usuário ou senha embutidos não são aceitos.");
  if (!u.hostname) throw new ExtractError("invalid_url", "URL inválida.");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (![...EXTRACTION.allowedPorts, ...extraPorts].includes(port)) throw new ExtractError("invalid_url", "Porta não permitida.");
  return u;
}

function decoderFor(contentType: string, head: Buffer): string {
  const fromHeader = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const ascii = head.subarray(0, 4096).toString("latin1");
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(ascii)?.[1];
  return meta ?? "utf-8";
}

function decode(buf: Buffer, contentType: string): string {
  const label = decoderFor(contentType, buf);
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

interface HopResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body?: Buffer;
}

function requestOnce(u: URL, signal: AbortSignal, opts: Required<Pick<SafeFetchOptions, "maxBytes">> & SafeFetchOptions): Promise<HopResult> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const allowed = opts.isAllowedAddress ?? ((ip: string) => !isBlockedAddress(ip));
  if (net.isIP(host) && !allowed(host)) return Promise.reject(new BlockedDestinationError());
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      u,
      {
        method: "GET",
        signal,
        lookup: makeSafeLookup(allowed) as unknown as net.LookupFunction,
        agent: false, // sem reaproveitar sockets entre destinos
        headers: {
          "user-agent": EXTRACTION.userAgent,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.6",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolve({ status, headers: res.headers });
          return;
        }
        if (status >= 400) {
          res.resume();
          resolve({ status, headers: res.headers });
          return;
        }
        const ct = String(res.headers["content-type"] ?? "").toLowerCase();
        const mime = ct.split(";")[0].trim();
        if (!(EXTRACTION.allowedContentTypes as readonly string[]).includes(mime)) {
          res.destroy();
          reject(new ExtractError("unsupported_type", "Este link não aponta para uma página HTML."));
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > opts.maxBytes * 2) {
          res.destroy();
          reject(new ExtractError("too_large", "A página é grande demais para ser preparada."));
          return;
        }
        const enc = String(res.headers["content-encoding"] ?? "identity").toLowerCase().trim();
        let stream: Readable = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        else if (enc !== "identity" && enc !== "") {
          res.destroy();
          reject(new ExtractError("unsupported_type", "Codificação de conteúdo não suportada."));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (c: Buffer) => {
          total += c.length;
          if (total > opts.maxBytes) {
            res.destroy();
            stream.destroy();
            reject(new ExtractError("too_large", "A página é grande demais para ser preparada."));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", (e) => reject(e));
        res.on("error", (e) => reject(e));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function mapError(e: unknown, signal: AbortSignal): ExtractError {
  if (e instanceof ExtractError) return e;
  if (e instanceof BlockedDestinationError || (e as { code?: string })?.code === "forbidden_destination") {
    return new ExtractError("forbidden_destination", "Este endereço não pode ser acessado.");
  }
  if (signal.aborted || (e as { name?: string })?.name === "AbortError") return new ExtractError("timeout", "A página demorou demais para responder.");
  const code = (e as { code?: string })?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH") {
    return new ExtractError("unavailable", "A página não está disponível.");
  }
  if (typeof code === "string" && (code.startsWith("ERR_TLS") || code.includes("CERT"))) {
    return new ExtractError("unavailable", "Não foi possível estabelecer uma conexão segura com a página.");
  }
  if (code === "Z_DATA_ERROR" || code === "ERR__ERROR_FORMAT_PADDING_1") return new ExtractError("unavailable", "A resposta da página veio corrompida.");
  return new ExtractError("unavailable", "A página não está disponível.");
}

function statusError(status: number): ExtractError {
  if (status === 401 || status === 402) return new ExtractError("possibly_restricted", "A página parece exigir login ou assinatura.", status);
  if (status === 403 || status === 429 || status === 451) return new ExtractError("blocked", "O site recusou o acesso automático.", status);
  if (status === 404 || status === 410) return new ExtractError("unavailable", "A página não foi encontrada.", status);
  return new ExtractError("unavailable", "A página não está disponível no momento.", status);
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<FetchedPage> {
  const opts = {
    timeoutMs: options.timeoutMs ?? EXTRACTION.timeoutMs,
    maxRedirects: options.maxRedirects ?? EXTRACTION.maxRedirects,
    maxBytes: options.maxBytes ?? EXTRACTION.maxBytes,
    ...options,
  };
  const original = validateUrl(rawUrl, opts.extraPorts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let current = original;
  try {
    for (let hop = 0; ; hop++) {
      let r: HopResult;
      try {
        r = await requestOnce(current, controller.signal, { ...opts, maxBytes: opts.maxBytes });
      } catch (e) {
        throw mapError(e, controller.signal);
      }
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        if (hop >= opts.maxRedirects) throw new ExtractError("unavailable", "A página redirecionou vezes demais.");
        let next: URL;
        try {
          next = new URL(String(r.headers.location), current);
        } catch {
          throw new ExtractError("unavailable", "Redirecionamento inválido.");
        }
        current = validateUrl(next.toString(), opts.extraPorts); // revalida cada salto
        continue;
      }
      if (r.status >= 400) throw statusError(r.status);
      const ct = String(r.headers["content-type"] ?? "");
      return { originalUrl: original.toString(), finalUrl: current.toString(), html: decode(r.body ?? Buffer.alloc(0), ct), contentType: ct };
    }
  } finally {
    clearTimeout(timer);
  }
}
