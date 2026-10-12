"use client";
/**
 * Mapa mental em 3D, no estilo da visão de grafo do Obsidian: física de forças,
 * arrastar nós, tocar numa ideia acende os vizinhos, giro automático e rótulos.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { corDoGrupo, type DadosGrafo, type NoGrafo } from "@/lib/gravador/grafo";

export interface Grafo3DRef {
  /** Imagem PNG do ângulo atual, para compartilhar. */
  foto(): Promise<Blob | null>;
  centralizar(): void;
}

type No = NoGrafo & { x?: number; y?: number; z?: number };
type Lig = { source: string | No; target: string | No; rotulo?: string };

const idDe = (v: string | No) => (typeof v === "string" ? v : v.id);

export const Grafo3D = forwardRef<Grafo3DRef, { dados: DadosGrafo; altura?: number; aoEscolher?: (n: NoGrafo | null) => void }>(function Grafo3D(
  { dados, altura = 460, aoEscolher },
  ref,
) {
  const caixa = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grafo = useRef<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const escolhido = useRef<string | null>(null);
  const aoEscolherRef = useRef(aoEscolher);
  aoEscolherRef.current = aoEscolher;

  useImperativeHandle(ref, () => ({
    foto: () =>
      new Promise((ok) => {
        const g = grafo.current;
        if (!g) return ok(null);
        g.renderer().render(g.scene(), g.camera());
        (g.renderer().domElement as HTMLCanvasElement).toBlob((b) => ok(b), "image/png");
      }),
    centralizar: () => grafo.current?.zoomToFit(600, 40),
  }));

  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | null = null;
    (async () => {
      const el = caixa.current;
      if (!el) return;
      try {
        const [{ default: ForceGraph3D }, { default: SpriteText }] = await Promise.all([import("3d-force-graph"), import("three-spritetext")]);
        if (!vivo) return;
        const vizinhos = new Map<string, Set<string>>();
        for (const l of dados.links) {
          const a = idDe(l.source as string);
          const b = idDe(l.target as string);
          if (!vizinhos.has(a)) vizinhos.set(a, new Set());
          if (!vizinhos.has(b)) vizinhos.set(b, new Set());
          vizinhos.get(a)!.add(b);
          vizinhos.get(b)!.add(a);
        }
        const aceso = (id: string) => !escolhido.current || id === escolhido.current || vizinhos.get(escolhido.current)?.has(id);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = new (ForceGraph3D as any)(el, { controlType: "orbit", rendererConfig: { preserveDrawingBuffer: true, antialias: true } });
        grafo.current = g;
        g.width(el.clientWidth)
          .height(altura)
          .backgroundColor("#0d1216")
          .showNavInfo(false)
          .graphData({ nodes: dados.nodes.map((n) => ({ ...n })), links: dados.links.map((l) => ({ ...l })) })
          .nodeVal((n: No) => n.tamanho)
          .nodeRelSize(3)
          .nodeOpacity(0.95)
          .nodeResolution(16)
          .nodeColor((n: No) => (aceso(n.id) ? corDoGrupo(n.grupo, n.tipo) : "#2a343b"))
          .nodeLabel((n: No) => `${n.rotulo}${n.trechos.length > 1 ? ` · em ${n.trechos.length} gravações` : ""}`)
          .nodeThreeObjectExtend(true)
          .nodeThreeObject((n: No) => {
            const s = new SpriteText(n.rotulo.length > 28 ? `${n.rotulo.slice(0, 27)}…` : n.rotulo);
            s.color = n.tipo === "ideia" ? "#d8e0e4" : "#ffffff";
            s.textHeight = n.tipo === "ideia" ? 4.2 : 6;
            s.fontWeight = n.tipo === "ideia" ? "400" : "700";
            s.backgroundColor = "rgba(13,18,22,0.55)";
            s.padding = 1;
            s.borderRadius = 2;
            (s as unknown as { position: { y: number } }).position.y = -(Math.cbrt(n.tamanho) * 3 + 4);
            return s;
          })
          .linkColor((l: Lig) => (escolhido.current && (idDe(l.source) === escolhido.current || idDe(l.target) === escolhido.current) ? "#f6d32d" : "#5b6b74"))
          .linkOpacity(0.45)
          .linkWidth((l: Lig) => (escolhido.current && (idDe(l.source) === escolhido.current || idDe(l.target) === escolhido.current) ? 1.4 : 0.4))
          .linkDirectionalParticles((l: Lig) => (escolhido.current && (idDe(l.source) === escolhido.current || idDe(l.target) === escolhido.current) ? 3 : 0))
          .linkDirectionalParticleWidth(1.6)
          .d3VelocityDecay(0.3)
          .onNodeClick((n: No) => {
            escolhido.current = escolhido.current === n.id ? null : n.id;
            g.nodeColor(g.nodeColor()).linkColor(g.linkColor()).linkWidth(g.linkWidth()).linkDirectionalParticles(g.linkDirectionalParticles());
            aoEscolherRef.current?.(escolhido.current ? n : null);
            if (escolhido.current && n.x !== undefined) {
              const dist = 90;
              const r = 1 + dist / Math.hypot(n.x ?? 1, n.y ?? 1, n.z ?? 1);
              g.cameraPosition({ x: (n.x ?? 0) * r, y: (n.y ?? 0) * r, z: (n.z ?? 0) * r }, n, 900);
            }
          })
          .onBackgroundClick(() => {
            escolhido.current = null;
            g.nodeColor(g.nodeColor()).linkColor(g.linkColor()).linkWidth(g.linkWidth()).linkDirectionalParticles(g.linkDirectionalParticles());
            aoEscolherRef.current?.(null);
          })
          .onNodeDragEnd((n: No & { fx?: number; fy?: number; fz?: number }) => {
            n.fx = n.x;
            n.fy = n.y;
            n.fz = n.z;
          });
        g.d3Force("charge")?.strength(-90);
        g.d3Force("link")?.distance(38);

        const controles = g.controls();
        controles.autoRotate = true;
        controles.autoRotateSpeed = 0.6;
        controles.addEventListener?.("start", () => (controles.autoRotate = false));
        // enquadra quando a física se acomoda (e de novo se ela demorar)
        let enquadrou = false;
        g.cooldownTicks(150).onEngineStop(() => {
          if (!vivo || enquadrou) return;
          enquadrou = true;
          g.zoomToFit(700, 30);
        });
        setTimeout(() => vivo && !enquadrou && g.zoomToFit(700, 30), 2500);

        observador = new ResizeObserver(() => g.width(el.clientWidth));
        observador.observe(el);
      } catch (e) {
        setErro(`Não consegui abrir o mapa 3D neste aparelho (${(e as Error).message}).`);
      }
    })();
    return () => {
      vivo = false;
      observador?.disconnect();
      grafo.current?._destructor?.();
      grafo.current = null;
      if (caixa.current) caixa.current.innerHTML = "";
    };
  }, [dados, altura]);

  if (erro) return <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">{erro}</p>;
  return <div ref={caixa} className="w-full overflow-hidden rounded-xl" style={{ height: altura, background: "#0d1216", touchAction: "none" }} aria-label="Mapa mental em 3D. Arraste para girar, use dois dedos para aproximar e toque numa ideia para ver as ligações." role="img" />;
});
