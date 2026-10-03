/**
 * Reader Engine — independente de React/DOM.
 * Fonte única de verdade para posição, estado, cronometragem e métricas da leitura.
 *
 * Tempo ativo usa relógio monotônico (performance.now por padrão).
 * O agendamento corrige atrasos pequenos do timer, mas nunca "compensa" atrasos
 * grandes pulando palavras: se o timer atrasar, a próxima apresentação começa agora.
 */
import type { ChunkSize, ReadingMode } from "@/lib/types";
import type { Token } from "@/lib/text";
import { PositionSet } from "@/lib/metrics";
import {
  buildChunks,
  chunkDurationMs,
  chunkSizeForMode,
  nextSentenceStart,
  prevSentenceStart,
  tokenToChunkMap,
  type Chunk,
} from "./chunks";
import { WPM } from "@/lib/config";

export type EngineState = "preparado" | "lendo" | "pausado" | "concluida";
export type PauseReason = "manual" | "oculta" | "fim" | null;

export interface EngineSettings {
  mode: ReadingMode;
  wpm: number;
  chunkSize: ChunkSize;
  smartPauses: boolean;
}

export interface EngineRestore {
  tokenIndex: number;
  activeDurationMs: number;
  pausedDurationMs: number;
  presentedWordCount: number;
  presentedBitset: string;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface EngineSnapshot {
  state: EngineState;
  pauseReason: PauseReason;
  settings: EngineSettings;
  tokenIndex: number;
  chunk: Chunk | null;
  chunkIndex: number;
  chunkCount: number;
  activeDurationMs: number;
  pausedDurationMs: number;
  presentedWordCount: number;
  uniquePresentedWordCount: number;
  totalWords: number;
  progress: number; // 0..1 pela posição
}

type Listener = (s: EngineSnapshot) => void;
export type EngineEvent = "present" | "state" | "settings" | "seek" | "finish";

const LATE_TOLERANCE_MS = 50;

export class ReaderEngine {
  private tokens: Token[];
  private clock: Clock;
  private settings: EngineSettings;
  private chunks: Chunk[] = [];
  private map: Int32Array = new Int32Array(0);
  private chunkIndex = 0;
  private state: EngineState = "preparado";
  private pauseReason: PauseReason = null;
  private presented: PositionSet;
  private presentedWordCount = 0;
  private currentCounted = false;
  private activeAccum = 0;
  private pausedAccum = 0;
  private activeSince: number | null = null;
  private pausedSince: number | null = null;
  private timer: unknown = null;
  private nextAt = 0;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<(e: EngineEvent) => void>();
  /** Posição livre (modo texto livre / seleção do usuário), em tokens. */
  private freeIndex = 0;

  constructor(tokens: Token[], settings: EngineSettings, restore?: EngineRestore, clock: Clock = realClock) {
    this.tokens = tokens;
    this.clock = clock;
    this.settings = { ...settings, wpm: clampWpm(settings.wpm) };
    this.presented = new PositionSet(tokens.length, restore?.presentedBitset);
    this.rebuildChunks();
    if (restore) {
      this.activeAccum = restore.activeDurationMs;
      this.pausedAccum = restore.pausedDurationMs;
      this.presentedWordCount = restore.presentedWordCount;
      this.seekInternal(restore.tokenIndex);
      // sessão recuperada sempre retoma pausada
      if (restore.activeDurationMs > 0 || restore.tokenIndex > 0) {
        this.state = "pausado";
        this.pauseReason = "manual";
        this.pausedSince = this.clock.now();
      }
    }
  }

  // ---------- leitura de estado ----------
  get tokenIndex(): number {
    return this.settings.mode === "free" ? this.freeIndex : (this.chunks[this.chunkIndex]?.start ?? 0);
  }

  snapshot(): EngineSnapshot {
    const now = this.clock.now();
    const active = this.activeAccum + (this.activeSince !== null ? now - this.activeSince : 0);
    const paused = this.pausedAccum + (this.pausedSince !== null ? now - this.pausedSince : 0);
    const chunk = this.settings.mode === "free" ? null : (this.chunks[this.chunkIndex] ?? null);
    const total = this.tokens.length;
    let progress = total ? this.tokenIndex / total : 0;
    if (this.state === "concluida") progress = 1;
    return {
      state: this.state,
      pauseReason: this.pauseReason,
      settings: { ...this.settings },
      tokenIndex: this.tokenIndex,
      chunk,
      chunkIndex: this.chunkIndex,
      chunkCount: this.chunks.length,
      activeDurationMs: Math.round(active),
      pausedDurationMs: Math.round(paused),
      presentedWordCount: this.presentedWordCount,
      uniquePresentedWordCount: this.presented.count,
      totalWords: total,
      progress,
    };
  }

  encodePresented(): string {
    return this.presented.encode();
  }

  getChunks(): readonly Chunk[] {
    return this.chunks;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn: (e: EngineEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  // ---------- comandos ----------
  play(): void {
    if (this.state === "lendo" || this.tokens.length === 0) return;
    if (this.state === "concluida") return;
    this.setState("lendo", null);
    if (this.settings.mode === "free") {
      this.emit("state");
      return;
    }
    this.presentCurrent(this.clock.now());
  }

  pause(reason: Exclude<PauseReason, null | "fim"> = "manual"): void {
    if (this.state !== "lendo") return;
    this.clearTimer();
    this.setState("pausado", reason);
    this.emit("state");
  }

  toggle(): void {
    if (this.state === "lendo") this.pause("manual");
    else this.play();
  }

  /** Avança uma frase. Palavras puladas NÃO contam como apresentadas. */
  next(): void {
    if (this.tokens.length === 0 || this.state === "concluida") return;
    this.jumpTo(nextSentenceStart(this.tokens, this.tokenIndex));
  }

  /** Volta uma frase. */
  prev(): void {
    if (this.tokens.length === 0) return;
    if (this.state === "concluida") {
      this.state = "pausado";
      this.pauseReason = "manual";
      this.pausedSince = this.clock.now();
    }
    this.jumpTo(prevSentenceStart(this.tokens, this.tokenIndex));
  }

  /** Posiciona em um token (ex.: toque no texto guiado). */
  seek(tokenIndex: number): void {
    if (this.state === "concluida") {
      this.state = "pausado";
      this.pauseReason = "manual";
      this.pausedSince = this.clock.now();
    }
    this.jumpTo(tokenIndex);
  }

  setWpm(wpm: number): void {
    const v = clampWpm(wpm);
    if (v === this.settings.wpm) return;
    this.settings.wpm = v;
    // a apresentação atual mantém a duração; o novo ritmo vale a partir da próxima
    this.emitAll("settings");
  }

  setSmartPauses(on: boolean): void {
    this.settings.smartPauses = on;
    this.emitAll("settings");
  }

  /** Troca de modo — somente pausado ou preparado. Preserva posição equivalente. */
  setMode(mode: ReadingMode, chunkSize: ChunkSize = this.settings.chunkSize): boolean {
    if (this.state === "lendo") return false;
    const pos = this.tokenIndex;
    this.settings.mode = mode;
    this.settings.chunkSize = chunkSize;
    this.rebuildChunks();
    this.seekInternal(pos);
    this.emitAll("settings");
    return true;
  }

  /** Encerra a leitura (por conclusão ou pelo usuário). */
  finish(): void {
    this.clearTimer();
    this.setState("concluida", "fim");
    this.emit("finish");
  }

  /** O usuário chegou ao fim naturalmente (modos automáticos). */
  get reachedEnd(): boolean {
    return this.state === "concluida" && this.pauseReason === "fim" && this.naturalEnd;
  }
  private naturalEnd = false;

  destroy(): void {
    this.clearTimer();
    this.listeners.clear();
    this.eventListeners.clear();
  }

  // ---------- internos ----------
  private rebuildChunks(): void {
    this.chunks = buildChunks(this.tokens, chunkSizeForMode(this.settings.mode, this.settings.chunkSize));
    this.map = tokenToChunkMap(this.chunks, this.tokens.length);
  }

  private seekInternal(tokenIndex: number): void {
    const i = Math.max(0, Math.min(tokenIndex, this.tokens.length - 1));
    this.freeIndex = Math.max(0, i);
    if (this.chunks.length) this.chunkIndex = this.map[Math.max(0, i)] ?? 0;
    this.currentCounted = false;
  }

  private jumpTo(tokenIndex: number): void {
    const playing = this.state === "lendo";
    this.clearTimer();
    this.seekInternal(tokenIndex);
    if (playing && this.settings.mode !== "free") this.presentCurrent(this.clock.now());
    this.emitAll("seek");
  }

  private presentCurrent(startAt: number): void {
    const chunk = this.chunks[this.chunkIndex];
    if (!chunk) {
      this.naturalEnd = true;
      this.finish();
      return;
    }
    if (!this.currentCounted) {
      for (let i = chunk.start; i < chunk.end; i++) this.presented.add(i);
      this.presentedWordCount += chunk.end - chunk.start;
      this.currentCounted = true;
    }
    const dur = chunkDurationMs(this.tokens, chunk, this.settings.wpm, this.settings.smartPauses);
    this.nextAt = startAt + dur;
    this.timer = this.clock.setTimeout(() => this.advance(), Math.max(0, this.nextAt - this.clock.now()));
    this.emitAll("present");
  }

  private advance(): void {
    this.timer = null;
    if (this.state !== "lendo") return;
    const now = this.clock.now();
    // pequena correção de deriva; atrasos grandes NÃO são compensados
    const start = now - this.nextAt <= LATE_TOLERANCE_MS ? this.nextAt : now;
    if (this.chunkIndex >= this.chunks.length - 1) {
      this.naturalEnd = true;
      this.finish();
      return;
    }
    this.chunkIndex++;
    this.currentCounted = false;
    this.presentCurrent(start);
  }

  private setState(s: EngineState, reason: PauseReason): void {
    const now = this.clock.now();
    if (this.activeSince !== null) {
      this.activeAccum += now - this.activeSince;
      this.activeSince = null;
    }
    if (this.pausedSince !== null) {
      this.pausedAccum += now - this.pausedSince;
      this.pausedSince = null;
    }
    this.state = s;
    this.pauseReason = reason;
    if (s === "lendo") this.activeSince = now;
    if (s === "pausado") this.pausedSince = now;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(e: EngineEvent): void {
    this.emitAll(e);
  }

  private emitAll(e: EngineEvent): void {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
    this.eventListeners.forEach((l) => l(e));
  }
}

export function clampWpm(v: number): number {
  if (!Number.isFinite(v)) return WPM.default;
  return Math.min(WPM.max, Math.max(WPM.min, Math.round(v)));
}
