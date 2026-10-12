"use client";
/**
 * Tela de gravação em tela cheia. Abrir /gravar/gravando já começa a gravar,
 * por isso é o endereço usado pelo Atalho do iPhone (Botão de Ação ou Siri).
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hhmmss } from "@/lib/gravador/store";
import { useGravacao } from "@/lib/gravador/useGravacao";

const BARRAS = 40;

export default function GravandoPage() {
  const router = useRouter();
  const g = useGravacao();
  const [salvando, setSalvando] = useState(false);
  const barras = useRef<HTMLDivElement>(null);
  const tentou = useRef(false);
  const pararRef = useRef(g.parar);
  pararRef.current = g.parar;

  // começa sozinho ao abrir (se o navegador permitir sem toque, senão mostra o botão)
  useEffect(() => {
    if (tentou.current) return;
    tentou.current = true;
    void g.comecar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // sair da tela no meio da gravação salva o que foi gravado
  useEffect(() => () => void pararRef.current(), []);

  // medidor: histórico do nível desenhado direto no DOM, sem re-renderizar
  useEffect(() => {
    const hist = new Array(BARRAS).fill(0);
    let q = 0;
    const passo = () => {
      hist.push(g.nivel.current);
      hist.shift();
      const filhos = barras.current?.children;
      if (filhos) for (let i = 0; i < filhos.length; i++) (filhos[i] as HTMLElement).style.transform = `scaleY(${0.06 + hist[i] * 0.94})`;
      q = requestAnimationFrame(passo);
    };
    passo();
    return () => cancelAnimationFrame(q);
  }, [g.nivel]);

  async function parar() {
    setSalvando(true);
    const nova = await g.parar();
    router.replace(nova ? `/gravar/${nova.id}?transcrever=1` : "/gravar");
  }

  const ativo = g.estado !== "parado";

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center pt-10 text-center">
      <p className="font-medium">
        <span
          aria-hidden
          className={`mr-2 inline-block h-3 w-3 rounded-full ${g.estado === "gravando" ? "animate-pulse bg-[#e5483b]" : "bg-muted"}`}
        />
        {g.estado === "gravando" ? "Gravando" : g.estado === "pausado" ? "Pausado" : salvando ? "Salvando…" : "Pronto para gravar"}
      </p>
      <p className="my-4 font-light tabular-nums text-6xl" aria-live="off">
        {hhmmss(g.segundos)}
      </p>
      <div ref={barras} aria-hidden className="mb-8 flex h-24 items-center justify-center gap-[3px]">
        {Array.from({ length: BARRAS }, (_, i) => (
          <i
            key={i}
            style={{ transform: "scaleY(.06)" }}
            className={`block h-full w-1 origin-center rounded ${g.estado === "gravando" ? "bg-[#e5483b]" : "bg-muted"} transition-transform duration-75`}
          />
        ))}
      </div>

      {g.erro && (
        <p role="alert" className="mb-4 max-w-sm text-danger">
          {g.erro}
        </p>
      )}

      {ativo ? (
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <button type="button" className="btn" onClick={g.pausarOuContinuar}>
            {g.estado === "pausado" ? "Continuar" : "Pausar"}
          </button>
          <button type="button" className="btn border-[#e5483b] bg-[#e5483b] text-white" onClick={() => void parar()} disabled={salvando}>
            Parar e salvar
          </button>
        </div>
      ) : (
        !salvando && (
          <div className="grid w-full max-w-sm gap-3">
            <button type="button" className="btn btn-primary" onClick={() => void g.comecar()}>
              Começar a gravar
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => router.push("/gravar")}>
              Voltar
            </button>
          </div>
        )
      )}

      <p className="mt-6 max-w-sm text-sm text-muted">
        Deixe o app aberto: a tela fica acesa sozinha. Se o iPhone bloquear, o Safari pausa o microfone. Para gravar com o celular no bolso, use o
        Atalho com o gravador nativo (veja em Ajustes).
      </p>
    </div>
  );
}
