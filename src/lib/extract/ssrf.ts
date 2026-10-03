/**
 * Proteção contra SSRF aplicada NA CONEXÃO: o endereço validado é exatamente
 * o endereço usado para conectar (lookup customizado), evitando DNS rebinding.
 */
import net from "node:net";
import dns from "node:dns";

const v4 = new net.BlockList();
[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + metadados de nuvem (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado + broadcast
].forEach(([a, p]) => v4.addSubnet(a as string, p as number, "ipv4"));

const v6 = new net.BlockList();
[
  ["::", 96], // não especificado, loopback (::1) e IPv4-compatível
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // descarte
  ["2001::", 23], // IETF especial (inclui Teredo 2001::/32)
  ["2001:db8::", 32], // documentação
  ["2002::", 16], // 6to4
  ["3fff::", 20], // documentação
  ["5f00::", 16], // SRv6
  ["fc00::", 7], // ULA (inclui fd00:ec2::254 de metadados)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (obsoleto)
  ["ff00::", 8], // multicast
].forEach(([a, p]) => v6.addSubnet(a as string, p as number, "ipv6"));

/** Expande IPv6 para 8 grupos de 16 bits. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  // sufixo IPv4 pontuado
  const m = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const parts = m[1].split(".").map(Number);
    if (parts.some((p) => p > 255)) return null;
    s = s.slice(0, -m[1].length) + ((parts[0] << 8) | parts[1]).toString(16) + ":" + ((parts[2] << 8) | parts[3]).toString(16);
  }
  const [head, tail] = s.split("::");
  if (s.split("::").length > 2) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const groups = [...h, ...Array(fill).fill("0"), ...t];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

/** true se o endereço NÃO pode ser acessado. Endereço inválido também é bloqueado. */
export function isBlockedAddress(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, "");
  const fam = net.isIP(clean);
  if (fam === 4) return v4.check(clean, "ipv4");
  if (fam === 6) {
    const g = expandV6(clean);
    if (!g) return true;
    // IPv4 embutido (mapeado ::ffff:a.b.c.d ou compatível ::a.b.c.d) → regra IPv4
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
      const embedded = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
      if (v4.check(embedded, "ipv4")) return true;
    }
    return v6.check(g.map((x) => x.toString(16)).join(":"), "ipv6");
  }
  return true;
}

export class BlockedDestinationError extends Error {
  code = "forbidden_destination" as const;
  constructor() {
    super("Destino não permitido.");
  }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * Cria a função `lookup` usada pelo socket. Resolve TODOS os endereços,
 * rejeita se QUALQUER um for proibido e entrega ao socket somente endereços validados.
 */
export function makeSafeLookup(isAllowed: (ip: string) => boolean = (ip) => !isBlockedAddress(ip)) {
  return (hostname: string, options: dns.LookupOptions | number | undefined, callback: LookupCb) => {
    const opts = typeof options === "object" && options ? options : {};
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as dns.LookupAddress[];
      if (!list.length || list.some((a) => !isAllowed(a.address))) {
        return callback(new BlockedDestinationError() as unknown as NodeJS.ErrnoException, "", 0);
      }
      if (opts.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}
