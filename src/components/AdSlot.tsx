"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export type Placement = "home" | "resultado" | "progresso" | "treinar";

interface Ad {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string;
  cta: string | null;
}

function track(ad: string, kind: "impression" | "click") {
  const body = JSON.stringify({ ad, kind });
  if (kind === "click" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/ads/track", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/ads/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** Propaganda cadastrada no painel. Nunca usada durante a leitura ou o questionário. */
export function AdSlot({ placement }: { placement: Placement }) {
  const [ad, setAd] = useState<Ad | null>(null);
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;
    sb.from("ads")
      .select("id, title, body, image_url, link_url, cta")
      .contains("placements", [placement])
      .limit(20)
      .then(({ data }) => {
        if (!alive || !data?.length) return;
        const pick = data[Math.floor(Math.random() * data.length)] as Ad;
        setAd(pick);
        track(pick.id, "impression");
      });
    return () => {
      alive = false;
    };
  }, [placement]);
  if (!ad) return null;
  return (
    <aside aria-label="Patrocinado" className="my-10 rounded-xl border-[1.5px] border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">Patrocinado</p>
      <a
        href={ad.link_url}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={() => track(ad.id, "click")}
        className="mt-2 flex items-start gap-4 no-underline"
      >
        {ad.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.image_url} alt="" className="size-20 shrink-0 rounded-lg object-cover" loading="lazy" />
        )}
        <span className="min-w-0">
          <span className="block font-serif text-lg font-bold">{ad.title}</span>
          {ad.body && <span className="mt-0.5 block text-sm text-muted">{ad.body}</span>}
          <span className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">{ad.cta || "Saiba mais"}</span>
        </span>
      </a>
    </aside>
  );
}
