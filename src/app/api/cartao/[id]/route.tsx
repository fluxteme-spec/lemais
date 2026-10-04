import { ImageResponse } from "next/og";
import { getShare, shareStats } from "@/lib/share/data";

export const runtime = "nodejs";

const C = { paper: "#eef1ec", ink: "#1c2b33", muted: "#56666c", marker: "#f3d75a", line: "#cfd8d2" };

/** Imagem do cartão de compartilhamento: formato=story (1080×1920) ou feed (1200×630). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const share = await getShare(id);
  if (!share) return new Response("Não encontrado", { status: 404 });
  const story = new URL(req.url).searchParams.get("formato") === "story";
  const W = story ? 1080 : 1200;
  const H = story ? 1920 : 630;
  const s = story ? 1.6 : 1;
  const stats = shareStats(share);
  const title = share.title.length > 90 ? share.title.slice(0, 87) + "…" : share.title;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: C.paper, color: C.ink, padding: 64 * s, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44 * s, fontWeight: 700, letterSpacing: -1 }}>LêMais</div>
            <div style={{ width: 150 * s, height: 8 * s, background: C.marker, borderRadius: 8, marginTop: 2 }} />
          </div>
          <div style={{ fontSize: 22 * s, color: C.muted }}>leitura, ritmo e compreensão</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26 * s, color: C.muted }}>{share.display_name ? `${share.display_name} leu` : "Leitura concluída"}</div>
          <div style={{ fontSize: (story ? 64 : 52) * s * (title.length > 60 ? 0.8 : 1), fontWeight: 700, lineHeight: 1.15, marginTop: 12 }}>{title}</div>
          {(share.source || share.adaptation) && (
            <div style={{ fontSize: 24 * s, color: C.muted, marginTop: 12 }}>{[share.source, share.adaptation].filter(Boolean).join(" · ")}</div>
          )}
          {share.excerpt && (
            <div style={{ display: "flex", fontSize: 28 * s, lineHeight: 1.4, marginTop: 28 * s, paddingLeft: 24, borderLeft: `8px solid ${C.marker}`, color: C.ink }}>
              “{share.excerpt}”
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 48 * s, borderTop: `3px solid ${C.line}`, paddingTop: 28 * s }}>
            {stats.map((x) => (
              <div key={x.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 48 * s, fontWeight: 700 }}>{x.value}</div>
                <div style={{ fontSize: 22 * s, color: C.muted }}>{x.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 32 * s, fontSize: 28 * s, fontWeight: 700 }}>
            <div style={{ background: C.ink, color: C.paper, padding: `${14 * s}px ${28 * s}px`, borderRadius: 999 }}>Venha ler comigo no LêMais</div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=3600" } },
  );
}
