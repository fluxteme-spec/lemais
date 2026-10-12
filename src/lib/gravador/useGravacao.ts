"use client";
/**
 * Gravação com o microfone: MediaRecorder + tela sempre acesa + rascunho salvo a cada
 * 10 s (se o Safari fechar, nada se perde) + nível do microfone para o medidor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apagarRascunho, guardar, novaGravacao, RASCUNHO, type Gravacao } from "./store";
import { lerAjustes } from "./ajustes";

export type Estado = "parado" | "gravando" | "pausado";

type WakeLock = { release(): Promise<void> };

export function useGravacao() {
  const [estado, setEstado] = useState<Estado>("parado");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const nivel = useRef(0); // 0..1, lido pelo medidor a cada quadro

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const acumulado = useRef(0);
  const inicioTrecho = useRef(0);
  const criadoEm = useRef(0);
  const timers = useRef<number[]>([]);
  const trava = useRef<WakeLock | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const quadro = useRef(0);

  const tempo = useCallback(
    () => acumulado.current + (rec.current?.state === "recording" ? (Date.now() - inicioTrecho.current) / 1000 : 0),
    [],
  );

  const manterTelaLigada = useCallback(async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLock> } }).wakeLock;
      trava.current = (await wl?.request("screen")) ?? null;
    } catch {}
  }, []);

  useEffect(() => {
    const voltar = () => {
      if (document.visibilityState === "visible" && rec.current && rec.current.state !== "inactive") void manterTelaLigada();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, [manterTelaLigada]);

  const desligar = useCallback(() => {
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
    cancelAnimationFrame(quadro.current);
    void audioCtx.current?.close();
    audioCtx.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void trava.current?.release().catch(() => {});
    trava.current = null;
    nivel.current = 0;
  }, []);

  useEffect(() => desligar, [desligar]);

  const comecar = useCallback(async () => {
    setErro(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setErro("Sem acesso ao microfone. No iPhone: Ajustes › Apps › Safari › Microfone › Permitir.");
      return false;
    }
    void navigator.storage?.persist?.();
    const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const r = new MediaRecorder(stream.current, tipo ? { mimeType: tipo, audioBitsPerSecond: 64000 } : {});
    rec.current = r;
    pedacos.current = [];
    acumulado.current = 0;
    criadoEm.current = Date.now();
    r.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data);
    r.start(1000);
    inicioTrecho.current = Date.now();
    setSegundos(0);
    setEstado("gravando");

    timers.current.push(window.setInterval(() => setSegundos(tempo()), 250));
    timers.current.push(
      window.setInterval(() => {
        void guardar({
          id: RASCUNHO,
          criadoEm: criadoEm.current,
          duracao: tempo(),
          mime: r.mimeType,
          audio: new Blob(pedacos.current, { type: r.mimeType }),
        });
      }, 10_000),
    );
    void manterTelaLigada();

    // medidor de nível
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtx.current = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream.current).connect(an);
    const dados = new Uint8Array(an.fftSize);
    const passo = () => {
      an.getByteTimeDomainData(dados);
      let pico = 0;
      for (const v of dados) pico = Math.max(pico, Math.abs(v - 128));
      nivel.current = rec.current?.state === "recording" ? Math.min(1, pico / 64) : 0;
      quadro.current = requestAnimationFrame(passo);
    };
    passo();
    return true;
  }, [manterTelaLigada, tempo]);

  const pausarOuContinuar = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    if (r.state === "recording") {
      acumulado.current += (Date.now() - inicioTrecho.current) / 1000;
      r.pause();
      setEstado("pausado");
    } else if (r.state === "paused") {
      inicioTrecho.current = Date.now();
      r.resume();
      setEstado("gravando");
    }
  }, []);

  /** Para, salva e devolve a gravação nova. */
  const parar = useCallback(async (): Promise<Gravacao | null> => {
    const r = rec.current;
    if (!r || r.state === "inactive") return null;
    const terminou = new Promise((ok) => (r.onstop = ok));
    const duracao = tempo();
    r.stop();
    await terminou;
    desligar();
    rec.current = null;
    const aj = lerAjustes();
    const g = novaGravacao(new Blob(pedacos.current, { type: r.mimeType }), duracao, { template: aj.template, personaId: aj.personaId, projetoId: aj.projetoId || undefined });
    await guardar(g);
    await apagarRascunho();
    setEstado("parado");
    return g;
  }, [desligar, tempo]);

  return { estado, segundos, erro, nivel, comecar, pausarOuContinuar, parar };
}
