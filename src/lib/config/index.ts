/**
 * Configuração central do LêMais.
 * Todos os limites e multiplicadores ficam aqui para serem ajustados num só lugar.
 */

export const TEXT_LIMITS = {
  maxWords: 30_000,
  maxChars: 300_000,
  /** Abaixo disso não geramos questionário: o texto é curto demais para perguntas úteis. */
  minWordsForQuiz: 120,
} as const;

export const WPM = {
  min: 100,
  max: 1000,
  step: 25,
  default: 300,
  presets: [200, 300, 400, 500, 600],
} as const;

/**
 * Pausas inteligentes, como fração extra da duração-base do bloco.
 * Em um mesmo limite textual aplica-se apenas a maior pausa (sem somar redundâncias).
 */
export const SMART_PAUSES = {
  comma: 0.5,
  sentenceEnd: 1.0,
  paragraphEnd: 1.6,
  /** Palavras a partir deste tamanho recebem acréscimo. */
  longWordChars: 10,
  /** Acréscimo por caractere acima do limite, por palavra longa. */
  longWordPerChar: 0.06,
  /** Teto do acréscimo de palavra longa (por palavra). */
  longWordMax: 0.5,
  /** Teto total de acréscimos sobre a duração-base. */
  maxTotalExtra: 2.0,
} as const;

export const ENGINE = {
  /** Intervalo de checkpoint durante a leitura (ms). */
  checkpointIntervalMs: 5_000,
  /** Abaixo disso a sessão mostra "Dados insuficientes". */
  minActiveMsForMetrics: 10_000,
  /** Tamanho máximo do bloco automático. */
  autoChunkMax: 4,
  metricsVersion: 1,
} as const;

export const EXTRACTION = {
  timeoutMs: 15_000,
  maxRedirects: 3,
  maxBytes: 5 * 1024 * 1024,
  allowedPorts: [80, 443],
  allowedContentTypes: ["text/html", "application/xhtml+xml"],
  /** Abaixo disso consideramos que não há conteúdo editorial. */
  minWords: 40,
  /** Abaixo disso avisamos que a extração pode estar incompleta. */
  suspiciousWords: 200,
  userAgent: "LemaisReader/0.1 (+leitura pessoal; extrai apenas artigos públicos)",
} as const;

export const AI = {
  timeoutMs: 45_000,
  maxOutputTokens: 2_500,
  /** Máximo de caracteres de texto enviados ao provedor (controle de custo). */
  maxInputChars: 40_000,
  maxAttempts: 2,
  questionCount: 5,
} as const;

export const RATE_LIMIT = {
  windowMs: 10 * 60_000,
  extractPerWindow: Number(process.env.LEMAIS_EXTRACT_RATE_LIMIT ?? 20),
  questionsPerWindow: Number(process.env.LEMAIS_QUESTIONS_RATE_LIMIT ?? 10),
  maxConcurrentExtractions: 4,
  maxConcurrentGenerations: 2,
} as const;
