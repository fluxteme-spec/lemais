"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { newId, repo } from "@/lib/persistence";
import { tokenize } from "@/lib/text";
import { deriveMetrics, formatDuration, formatScore, primaryAttempt, scoreAttempt } from "@/lib/metrics";
import { MODE_LABEL } from "@/lib/session";
import { generateQuestions, quizAvailability, type QuizAvailability } from "@/lib/client/actions";
import { FullTextView } from "@/components/ReaderViews";
import { Sheet } from "@/components/Sheet";
import { useAppState } from "@/components/AppState";
import type { Content, QuestionSet, QuizAttempt, ReadingSession } from "@/lib/types";

type Phase = "loading" | "missing" | "reading" | "offer" | "consent" | "generating" | "quiz" | "result";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { reportStorageError } = useAppState();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [availability, setAvailability] = useState<QuizAvailability | null>(null);
  const [set, setSet] = useState<QuestionSet | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [viewAttemptId, setViewAttemptId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await repo().getSession(id);
      if (!s) return setPhase("missing");
      const c = await repo().getContent(s.contentId);
      const atts = (await repo().listAttempts(s.id)).sort((a, b) => a.attemptNumber - b.attemptNumber);
      setSession(s);
      setContent(c);
      setAttempts(atts);
      if (s.status === "lendo" || s.status === "pausado" || s.status === "preparado") return setPhase("reading");
      const open = atts.find((a) => !a.finishedAt);
      if (open) {
        const qs = await repo().getQuestionSet(open.questionSetId);
        if (qs && c && qs.contentHash === c.contentHash) {
          setSet(qs);
          setAttempt(open);
          return setPhase("quiz");
        }
      }
      if (c && c.contentHash === s.contentHash) setAvailability(await quizAvailability(c));
      if (s.status === "concluida" && !atts.some((a) => a.finishedAt)) return setPhase("offer");
      setPhase("result");
    } catch (e) {
      reportStorageError(e);
      setPhase("missing");
    }
  }, [id, reportStorageError]);

  useEffect(() => {
    void load();
  }, [load]);

  const tokens = useMemo(() => (content ? tokenize(content.textBlocks) : []), [content]);

  async function saveSession(patch: Partial<ReadingSession>) {
    if (!session) return;
    const next = { ...session, ...patch };
    setSession(next);
    await repo().putSession(next).catch(reportStorageError);
  }

  async function startQuiz(qs: QuestionSet) {
    if (!session) return;
    await repo().putQuestionSet(qs).catch(() => {});
    const a: QuizAttempt = {
      id: newId(),
      sessionId: session.id,
      questionSetId: qs.id,
      answers: qs.questions.map(() => null),
      correctCount: null,
      questionCount: qs.questions.length,
      score: null,
      consultedText: false,
      attemptNumber: attempts.length + 1,
      reportedQuestionIds: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    setSet(qs);
    setAttempt(a);
    setShowText(false);
    await repo().putAttempt(a).catch(reportStorageError);
    if (session.status === "concluida") await saveSession({ status: "questionario" });
    setPhase("quiz");
  }

  async function acceptTest() {
    if (!availability || !content) return;
    setMessage(null);
    if (availability.kind === "ready") return startQuiz(availability.set);
    if (availability.kind === "can_generate") {
      const consented = await repo().getFlag("aiConsent").catch(() => false);
      if (!consented) return setPhase("consent");
      return runGeneration();
    }
  }

  async function runGeneration() {
    if (!content) return;
    await repo().setFlag("aiConsent", true).catch(() => {});
    setPhase("generating");
    const r = await generateQuestions(content);
    if (r.ok) return startQuiz(r.set);
    setMessage(r.message);
    setPhase("offer");
  }

  async function finishWithoutTest() {
    await saveSession({ status: "finalizada" });
    setPhase("result");
  }

  function answer(qi: number, opt: number) {
    setAttempt((cur) => {
      if (!cur) return cur;
      const a = { ...cur, answers: cur.answers.map((v, i) => (i === qi ? opt : v)) };
      void repo().putAttempt(a).catch(reportStorageError);
      return a;
    });
  }

  async function submitQuiz() {
    if (!attempt || !set) return;
    const r = scoreAttempt(attempt.answers, set.questions.map((q) => q.correctOption));
    const done: QuizAttempt = { ...attempt, ...r, finishedAt: new Date().toISOString() };
    await repo().putAttempt(done).catch(reportStorageError);
    const atts = [...attempts.filter((x) => x.id !== done.id), done].sort((a, b) => a.attemptNumber - b.attemptNumber);
    setAttempts(atts);
    setAttempt(null);
    setViewAttemptId(done.id);
    if (session?.status === "questionario") await saveSession({ status: "finalizada" });
    setPhase("result");
    window.scrollTo({ top: 0 });
  }

  async function toggleReport(a: QuizAttempt, qid: string) {
    const reported = a.reportedQuestionIds.includes(qid) ? a.reportedQuestionIds.filter((x) => x !== qid) : [...a.reportedQuestionIds, qid];
    const next = { ...a, reportedQuestionIds: reported };
    setAttempts((list) => list.map((x) => (x.id === a.id ? next : x)));
    await repo().putAttempt(next).catch(reportStorageError);
  }

  // ---------- telas ----------
  if (phase === "loading") return <p className="pt-12 text-muted">Carregando…</p>;
  if (phase === "missing" || !session)
    return (
      <div className="pt-12">
        <h1 className="font-serif text-3xl font-bold">Sessão não encontrada</h1>
        <Link href="/progresso" className="btn btn-primary mt-4">
          Ver meu progresso
        </Link>
      </div>
    );
  if (phase === "reading")
    return (
      <div className="pt-12">
        <h1 className="font-serif text-3xl font-bold">Leitura em andamento</h1>
        <Link href={`/ler/${session.id}`} className="btn btn-primary mt-4">
          Continuar leitura
        </Link>
      </div>
    );

  const metrics = deriveMetrics({
    mode: session.mode,
    modesUsed: session.modesUsed,
    activeDurationMs: session.activeDurationMs,
    presentedWordCount: session.presentedWordCount,
    uniquePresentedWordCount: session.uniquePresentedWordCount,
    totalWords: session.totalWords,
  });

  if (phase === "offer" || phase === "consent" || phase === "generating") {
    const canTest = availability?.kind === "ready" || availability?.kind === "can_generate";
    return (
      <div className="pt-10">
        <p className="text-muted">Leitura concluída — {session.contentTitle}</p>
        {phase === "offer" && (
          <>
            <h1 className="mt-2 font-serif text-4xl font-bold">Quer testar sua compreensão?</h1>
            {canTest ? (
              <p className="mt-2 max-w-prose text-muted">
                {availability?.kind === "ready" ? `${availability.set.questions.length} perguntas` : "Algumas perguntas"} de múltipla escolha sobre o
                texto. Você pode consultar o texto durante o teste, mas isso fica registrado.
              </p>
            ) : (
              <p className="mt-2 max-w-prose">
                {availability?.kind === "too_short"
                  ? "Este texto é curto demais para um questionário útil."
                  : availability?.kind === "unavailable"
                    ? availability.reason
                    : "O questionário não está disponível para este texto."}
              </p>
            )}
            {message && (
              <p role="alert" className="mt-3 border-l-4 border-danger pl-3">
                {message} A leitura já está salva.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {canTest && (
                <button type="button" className="btn btn-primary h-14 px-8 text-lg" onClick={() => void acceptTest()}>
                  Sim, testar
                </button>
              )}
              <button type="button" className="btn h-14 px-8 text-lg" onClick={() => void finishWithoutTest()}>
                {canTest ? "Não, finalizar" : "Finalizar"}
              </button>
            </div>
          </>
        )}
        {phase === "consent" && (
          <>
            <h1 className="mt-2 font-serif text-3xl font-bold">Antes de gerar as perguntas</h1>
            <p className="mt-3 max-w-prose">
              Para criar o questionário, o texto desta leitura será enviado ao provedor de IA configurado no servidor do LêMais. O texto não
              fica guardado no servidor do LêMais. As regras de retenção do provedor estão descritas em Configurações.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => void runGeneration()}>
                Enviar texto e gerar perguntas
              </button>
              <button type="button" className="btn" onClick={() => setPhase("offer")}>
                Voltar
              </button>
            </div>
          </>
        )}
        {phase === "generating" && (
          <p role="status" className="mt-6 text-lg">
            Gerando e conferindo as perguntas… Isso pode levar alguns segundos.
          </p>
        )}
      </div>
    );
  }

  if (phase === "quiz" && set && attempt && content) {
    const answered = attempt.answers.filter((a) => a !== null).length;
    return (
      <div className="pt-8">
        <p className="text-muted">
          {attempt.attemptNumber > 1 ? "Revisão — " : ""}
          {session.contentTitle}
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold">Questionário</h1>
        <p className="mt-2 text-sm text-muted">
          {set.source === "ai" ? "Perguntas geradas automaticamente e conferidas contra o texto." : "Perguntas revisadas."} A correção aparece
          depois que você enviar todas as respostas.
        </p>
        <button
          type="button"
          className="btn btn-quiet mt-2 px-0"
          onClick={() => {
            setShowText(true);
            if (!attempt.consultedText) {
              const a = { ...attempt, consultedText: true };
              setAttempt(a);
              void repo().putAttempt(a).catch(reportStorageError);
            }
          }}
        >
          Consultar o texto
        </button>
        {attempt.consultedText && <p className="text-sm text-muted">Este teste está registrado como “com consulta”.</p>}

        <ol className="mt-6 space-y-8">
          {set.questions.map((q, qi) => (
            <li key={q.id}>
              <fieldset>
                <legend className="font-serif text-xl font-bold">
                  <span className="text-muted">{qi + 1}.</span> {q.prompt}
                </legend>
                <div className="mt-3 space-y-2">
                  {q.options.map((o, oi) => (
                    <label
                      key={oi}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-3 has-[:checked]:border-ink has-[:checked]:bg-surface"
                    >
                      <input type="radio" name={`q${qi}`} className="mt-1 size-5 shrink-0 accent-[var(--ink)]" checked={attempt.answers[qi] === oi} onChange={() => answer(qi, oi)} />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="button" className="btn btn-primary h-14 px-8 text-lg" disabled={answered < set.questions.length} onClick={() => void submitQuiz()}>
            Enviar respostas
          </button>
          <span className="text-sm text-muted" aria-live="polite">
            {answered} de {set.questions.length} respondidas
          </span>
        </div>

        <Sheet open={showText} onClose={() => setShowText(false)} title="Texto (consulta)">
          <FullTextView blocks={content.textBlocks} tokens={tokens} fontSize={18} lineSpacing={1.6} />
        </Sheet>
      </div>
    );
  }

  // ---------- resultado ----------
  const finished = attempts.filter((a) => a.finishedAt);
  const primary = primaryAttempt(attempts);
  const shown = finished.find((a) => a.id === viewAttemptId) ?? primary;
  const partial = session.status === "parcial";
  const canRetry = availability?.kind === "ready" && finished.length > 0;

  return (
    <div className="pt-8">
      <p className="text-muted">{partial ? "Sessão parcial" : "Resultado"}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">{session.contentTitle}</h1>

      <section aria-labelledby="compr" className="mt-6">
        <h2 id="compr" className="sr-only">
          Compreensão
        </h2>
        {shown ? (
          <>
            <p className="font-serif text-3xl font-bold">{formatScore(shown)}</p>
            <p className="mt-1 text-sm text-muted">
              {shown.attemptNumber > 1 ? `Revisão nº ${shown.attemptNumber - 1}. ` : "Primeira tentativa. "}
              {shown.consultedText ? "Com consulta ao texto. " : "Sem consulta ao texto. "}
              Poucas perguntas dão apenas uma indicação limitada da compreensão.
            </p>
          </>
        ) : (
          <p className="font-serif text-2xl font-bold">
            Compreensão: <span className="font-normal">Não avaliada</span>
          </p>
        )}
      </section>

      <section aria-labelledby="metricas" className="mt-8">
        <h2 id="metricas" className="font-semibold">
          Leitura
        </h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-3">
          <dt className="text-muted">Modo</dt>
          <dd>{session.modesUsed.map((m) => MODE_LABEL[m]).join(", ")}</dd>
          {!session.modesUsed.every((m) => m === "free") && (
            <>
              <dt className="text-muted">Ritmo configurado</dt>
              <dd className="tabular-nums">
                {session.initialWpm === session.currentWpm ? `${session.currentWpm} PPM` : `${session.initialWpm} → ${session.currentWpm} PPM`}
              </dd>
            </>
          )}
          <dt className="text-muted">{metrics.observedIsEstimate ? "Ritmo estimado" : "Ritmo observado"}</dt>
          <dd className="tabular-nums">{metrics.insufficient ? "Dados insuficientes" : `${metrics.observedWpm} PPM`}</dd>
          <dt className="text-muted">Tempo ativo</dt>
          <dd className="tabular-nums">{formatDuration(session.activeDurationMs)}</dd>
          <dt className="text-muted">Palavras do texto</dt>
          <dd className="tabular-nums">{session.totalWords.toLocaleString("pt-BR")}</dd>
          {metrics.coveragePercent !== null && (
            <>
              <dt className="text-muted">Cobertura apresentada</dt>
              <dd className="tabular-nums">
                {metrics.coveragePercent.toLocaleString("pt-BR")}% ({session.uniquePresentedWordCount.toLocaleString("pt-BR")} posições)
              </dd>
            </>
          )}
        </dl>
        <p className="mt-3 max-w-prose text-sm text-muted">
          {metrics.observedIsEstimate
            ? "No texto livre, o ritmo é estimado dividindo o total de palavras pelo tempo ativo. Não há como saber se todo o texto foi lido."
            : "Ritmo observado = palavras apresentadas ÷ minutos ativos. Pausas inteligentes contam no tempo ativo; pausas manuais não. Cobertura indica quantas posições do texto foram exibidas, não quantas foram lidas."}
        </p>
      </section>

      {shown && set === null && <CorrectionLoader attempt={shown} onLoad={setSet} />}
      {shown && set && set.id === shown.questionSetId && (
        <section aria-labelledby="correcao" className="mt-10">
          <h2 id="correcao" className="font-semibold">
            Correção
          </h2>
          <ol className="mt-3 space-y-6">
            {set.questions.map((q, qi) => {
              const chosen = shown.answers[qi];
              const right = chosen === q.correctOption;
              return (
                <li key={q.id} className="border-l-4 pl-4" style={{ borderColor: right ? "var(--ok)" : "var(--danger)" }}>
                  <p className="font-serif text-lg font-bold">
                    {qi + 1}. {q.prompt}
                  </p>
                  <p className="mt-1">
                    <strong className={right ? "text-ok" : "text-danger"}>{right ? "Correta." : "Incorreta."}</strong>{" "}
                    {!right && chosen !== null && <>Sua resposta: {withPeriod(q.options[chosen])} </>}
                    Resposta certa: {withPeriod(q.options[q.correctOption])}
                  </p>
                  <p className="mt-1 text-muted">{q.explanation}</p>
                  <blockquote className="reading-text mt-2 border-l-2 border-marker pl-3 italic">{q.evidence}</blockquote>
                  <button type="button" className="btn btn-quiet mt-1 px-0 text-sm" aria-pressed={shown.reportedQuestionIds.includes(q.id)} onClick={() => void toggleReport(shown, q.id)}>
                    {shown.reportedQuestionIds.includes(q.id) ? "Problema reportado (desfazer)" : "Reportar problema nesta questão"}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-sm text-muted">Questões reportadas ficam marcadas neste navegador para você revisar depois.</p>
        </section>
      )}

      {finished.length > 1 && (
        <section className="mt-8">
          <h2 className="font-semibold">Tentativas</h2>
          <ul className="mt-2 space-y-1">
            {finished.map((a) => (
              <li key={a.id}>
                <button type="button" className="btn btn-quiet px-0" aria-pressed={shown?.id === a.id} onClick={() => setViewAttemptId(a.id)}>
                  {a.attemptNumber === 1 ? "Primeira tentativa" : `Revisão nº ${a.attemptNumber - 1}`}: {formatScore(a)}
                  {a.consultedText ? " (com consulta)" : ""}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">Revisões não substituem a primeira tentativa nas comparações.</p>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Ler outro texto
        </Link>
        <Link href="/progresso" className="btn">
          Meu progresso
        </Link>
        {canRetry && availability.kind === "ready" && (
          <button type="button" className="btn btn-quiet" onClick={() => void startQuiz(availability.set)}>
            Refazer o questionário (revisão)
          </button>
        )}
        {!finished.length && !partial && (availability?.kind === "ready" || availability?.kind === "can_generate") && (
          <button type="button" className="btn btn-quiet" onClick={() => setPhase("offer")}>
            Fazer o teste agora
          </button>
        )}
      </div>
    </div>
  );
}

function CorrectionLoader({ attempt, onLoad }: { attempt: QuizAttempt; onLoad: (s: QuestionSet) => void }) {
  useEffect(() => {
    repo()
      .getQuestionSet(attempt.questionSetId)
      .then((s) => s && onLoad(s))
      .catch(() => {});
  }, [attempt.questionSetId, onLoad]);
  return null;
}

function withPeriod(s: string): string {
  return /[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
}
