/** Modelo de dados do LêMais. Campos desconhecidos ficam null — nunca inventados. */

export type BlockType = "heading" | "paragraph";

export interface TextBlock {
  type: BlockType;
  text: string;
}

export type SourceType = "pasted" | "url" | "training" | "suggested";
export type Difficulty = "facil" | "intermediario" | "avancado" | "nao_classificada";

export interface Content {
  id: string;
  sourceType: SourceType;
  title: string;
  subtitle: string | null;
  author: string | null;
  publishedAt: string | null;
  siteName: string | null;
  originalUrl: string | null;
  finalUrl: string | null;
  textBlocks: TextBlock[];
  wordCount: number;
  contentHash: string;
  version: number;
  difficulty: Difficulty;
  /** Para textos da biblioteca. */
  trainingId: string | null;
  /** Avisos da extração (ex.: possivelmente incompleta). */
  warnings: string[];
  createdAt: string;
  /** Perguntas revisadas que acompanham textos sugeridos pelo painel. */
  curatedQuestions?: CuratedQuestion[] | null;
  /** Presente quando o texto é uma versão adaptada por IA de outro conteúdo. */
  adaptation?: Adaptation | null;
}

export type AdaptStyle = "simples" | "cientifico" | "academico" | "classico";

export interface Adaptation {
  fromId: string;
  fromTitle: string;
  style: AdaptStyle;
  provider: string;
  model: string;
}

export interface CuratedQuestion {
  prompt: string;
  options: string[];
  correctOption: number;
  explanation: string;
  evidence: string;
  focus?: "ideia_central" | "desenvolvimento" | "conclusao";
}

export type ReadingMode = "rsvp" | "chunk" | "guided" | "free";
export type ChunkSize = 2 | 3 | 4 | "auto";

export type SessionStatus =
  | "preparado"
  | "lendo"
  | "pausado"
  | "concluida"
  | "questionario"
  | "finalizada"
  | "parcial";

export interface ReadingSettings {
  mode: ReadingMode;
  targetWpm: number;
  fontSize: number; // px do texto do leitor
  lineSpacing: number; // multiplicador
  theme: "sistema" | "claro" | "escuro";
  chunkSize: ChunkSize;
  smartPauses: boolean;
  referenceLetterHighlight: boolean;
}

export interface ReadingSession {
  id: string;
  contentId: string;
  contentVersion: number;
  contentHash: string;
  contentTitle: string;
  totalWords: number;
  mode: ReadingMode;
  status: SessionStatus;
  currentTokenIndex: number;
  initialWpm: number;
  currentWpm: number;
  finalWpm: number | null;
  activeDurationMs: number;
  pausedDurationMs: number;
  presentedWordCount: number;
  uniquePresentedWordCount: number;
  /** Posições apresentadas, codificadas (base64 de bitset). */
  presentedBitset: string;
  observedWpm: number | null;
  coveragePercent: number | null;
  /** Modos usados ao longo da sessão (troca de modo permitida). */
  modesUsed: ReadingMode[];
  startedAt: string;
  lastCheckpointAt: string;
  finishedAt: string | null;
  settingsSnapshot: ReadingSettings;
  metricsVersion: number;
  difficulty: Difficulty;
  /** Estilo da versão adaptada lida, ou null para o texto original. */
  adaptation?: AdaptStyle | null;
}

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  correctOption: number;
  explanation: string;
  evidence: string;
  /** Índice do primeiro token da evidência no conteúdo, ou null se não localizada. */
  evidenceLocation: number | null;
  focus?: "ideia_central" | "desenvolvimento" | "conclusao";
}

export interface QuestionSet {
  id: string;
  contentId: string;
  contentVersion: number;
  contentHash: string;
  source: "curated" | "ai";
  providerMetadata: { provider: string; model: string } | null;
  questions: Question[];
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  sessionId: string;
  questionSetId: string;
  answers: (number | null)[];
  correctCount: number | null;
  questionCount: number;
  score: number | null;
  consultedText: boolean;
  attemptNumber: number;
  reportedQuestionIds: string[];
  startedAt: string;
  finishedAt: string | null;
}
