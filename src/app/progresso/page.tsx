"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { repo } from "@/lib/persistence";
import { deriveMetrics, formatDuration, formatScore, primaryAttempt } from "@/lib/metrics";
import { DIFFICULTY_LABEL, MODE_LABEL } from "@/lib/session";
import { useAppState } from "@/components/AppState";
import type { QuizAttempt, ReadingMode, ReadingSession } from "@/lib/types";

const STATUS_LABEL: Record<ReadingSession["status"], string> = {
  preparado: "Não iniciada",
  lendo: "Em andamento",
  pausado: "Pausada",
  concluida: "Concluída",
  questionario: "Questionário em andamento",
  finalizada: "Concluída",
  parcial: "Parcial",
};

const MODES: ReadingMode[] = ["rsvp", "chunk", "guided", "free"];

export default function ProgressPage() {
  const { reportStorageError } = useAppState();
  const [sessions, setSessions] = useState<ReadingSession[] | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [filter, setFilter] = useState<ReadingMode | "todos">("todos");

  async function load() {
    try {
      const [s, a] = await Promise.all([repo().listSessions(), repo().listAttempts()]);
      setSessions(s.filter((x) => x.status !== "preparado" || x.activeDurationMs > 0));
      setAttempts(a);
    } catch (e) {
      reportStorageError(e);
      setSessions([]);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bySession = useMemo(() => {
    const m = new Map<string, QuizAttempt[]>();
    for (const a of attempts) m.set(a.sessionId, [...(m.get(a.sessionId) ?? []), a]);
    return m;
  }, [attempts]);

  const stats = useMemo(() => {
    const list = sessions ?? [];
    const ended = list.filter((s) => s.finishedAt);
    const complete = ended.filter((s) => s.status !== "parcial").length;
    const partial = ended.filter((s) => s.status === "parcial").length;
    const activeMs = list.reduce((n, s) => n + s.activeDurationMs, 0);
    const presented = list.reduce((n, s) => n + s.presentedWordCount, 0);
    // ritmo observado por modo: somente sessões de um único modo e com dados suficientes
    const perMode = MODES.map((mode) => {
      const eligible = list.filter((s) => s.modesUsed.length === 1 && s.modesUsed[0] === mode).filter((s) => !deriveMetrics({ ...s }).insufficient);
      const minutes = eligible.reduce((n, s) => n + s.activeDurationMs, 0) / 60_000;
      const words = eligible.reduce((n, s) => n + (mode === "free" ? s.totalWords : s.presentedWordCount), 0);
      return { mode, sessions: eligible.length, wpm: minutes > 0 ? Math.round(words / minutes) : null };
    }).filter((m) => m.sessions > 0);
    // compreensão: só a primeira tentativa de sessões avaliadas, separando com/sem consulta
    const primaries = list.map((s) => primaryAttempt(bySession.get(s.id) ?? [])).filter((a): a is QuizAttempt => !!a);
    const avg = (xs: QuizAttempt[]) => (xs.length ? Math.round((xs.reduce((n, a) => n + (a.score ?? 0), 0) / xs.length) * 100) : null);
    const closed = primaries.filter((a) => !a.consultedText);
    const open = primaries.filter((a) => a.consultedText);
    return { complete, partial, activeMs, presented, perMode, evaluated: primaries.length, avgClosed: avg(closed), nClosed: closed.length, avgOpen: avg(open), nOpen: open.length };
  }, [sessions, bySession]);

  async function remove(s: ReadingSession) {
    if (!confirm(`Excluir a sessão “${s.contentTitle}”? Isso também apaga os questionários respondidos nela.`)) return;
    await repo().deleteSession(s.id).catch(reportStorageError);
    void load();
  }

  if (sessions === null) return <p className="pt-12 text-muted">Carregando…</p>;

  if (sessions.length === 0)
    return (
      <div className="pt-10">
        <h1 className="font-serif text-4xl font-bold">Meu progresso</h1>
        <p className="mt-3 max-w-prose">Ainda não há leituras registradas neste navegador. Depois da primeira leitura, você verá aqui tempo, ritmo e compreensão.</p>
        <Link href="/" className="btn btn-primary mt-5">
          Começar uma leitura
        </Link>
      </div>
    );

  const maxWpm = Math.max(1, ...stats.perMode.map((m) => m.wpm ?? 0));
  const shown = sessions.filter((s) => filter === "todos" || s.modesUsed.includes(filter));

  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">Meu progresso</h1>
      <p className="mt-2 text-sm text-muted">Dados salvos apenas neste navegador.</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="Sessões concluídas" value={String(stats.complete)} />
        <Stat label="Sessões parciais" value={String(stats.partial)} />
        <Stat label="Tempo ativo total" value={formatDuration(stats.activeMs)} />
        <Stat label="Palavras apresentadas" value={stats.presented.toLocaleString("pt-BR")} />
      </dl>

      <section aria-labelledby="ritmo" className="mt-10">
        <h2 id="ritmo" className="font-semibold">
          Ritmo observado por modo
        </h2>
        {stats.perMode.length === 0 ? (
          <p className="mt-2 text-muted">Ainda não há sessões com duração suficiente (mínimo de 10 segundos ativos) em um único modo.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-3" aria-hidden>
              {stats.perMode.map((m) => (
                <li key={m.mode}>
                  <div className="flex justify-between text-sm">
                    <span>{MODE_LABEL[m.mode]}</span>
                    <span className="tabular-nums">
                      {m.wpm} PPM{m.mode === "free" ? " (estimado)" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-3 rounded-full bg-line">
                    <div className="h-3 rounded-full bg-ink" style={{ width: `${((m.wpm ?? 0) / maxWpm) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <table className="sr-only">
              <caption>Ritmo observado por modo</caption>
              <thead>
                <tr>
                  <th>Modo</th>
                  <th>PPM</th>
                  <th>Sessões</th>
                </tr>
              </thead>
              <tbody>
                {stats.perMode.map((m) => (
                  <tr key={m.mode}>
                    <td>{MODE_LABEL[m.mode]}</td>
                    <td>{m.wpm}</td>
                    <td>{m.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm text-muted">
              Considera apenas sessões feitas em um único modo, com {stats.perMode.map((m) => `${m.sessions} em ${MODE_LABEL[m.mode].toLowerCase()}`).join(", ")}.
              Compare sessões do mesmo modo e de dificuldade parecida.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="compreensao" className="mt-10">
        <h2 id="compreensao" className="font-semibold">
          Compreensão
        </h2>
        {stats.evaluated === 0 ? (
          <p className="mt-2 text-muted">Nenhuma sessão com questionário ainda. Sessões sem teste não entram nesta média.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            <li>
              Sem consulta: {stats.avgClosed !== null ? <strong>{stats.avgClosed}% de acertos</strong> : "—"}{" "}
              <span className="text-muted">({stats.nClosed} {stats.nClosed === 1 ? "sessão" : "sessões"})</span>
            </li>
            <li>
              Com consulta: {stats.avgOpen !== null ? <strong>{stats.avgOpen}% de acertos</strong> : "—"}{" "}
              <span className="text-muted">({stats.nOpen} {stats.nOpen === 1 ? "sessão" : "sessões"})</span>
            </li>
            <li className="text-sm text-muted">
              {stats.evaluated} de {sessions.length} sessões com questionário. Só a primeira tentativa de cada sessão é considerada; com poucos testes, a
              média é apenas indicativa.
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="historico" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="historico" className="font-semibold">
            Histórico
          </h2>
          <label className="flex items-center gap-2 text-sm">
            Modo
            <select className="field min-h-11 w-auto py-1" value={filter} onChange={(e) => setFilter(e.target.value as ReadingMode | "todos")}>
              <option value="todos">Todos</option>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {shown.map((s) => {
            const m = deriveMetrics({ ...s });
            const p = primaryAttempt(bySession.get(s.id) ?? []);
            const reading = s.status === "lendo" || s.status === "pausado" || s.status === "preparado";
            return (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-4">
                <div className="min-w-0">
                  <Link href={reading ? `/ler/${s.id}` : `/sessao/${s.id}`} className="font-serif text-lg font-bold underline-offset-4 hover:underline">
                    {s.contentTitle}
                  </Link>
                  <p className="text-sm text-muted">
                    {new Date(s.startedAt).toLocaleDateString("pt-BR", { dateStyle: "medium" })} — {STATUS_LABEL[s.status]} — {s.modesUsed.map((x) => MODE_LABEL[x]).join(", ")}
                  </p>
                  <p className="text-sm">
                    {m.insufficient ? "Dados insuficientes" : `${m.observedWpm} PPM${m.observedIsEstimate ? " (estimado)" : ""}`} ·{" "}
                    {formatDuration(s.activeDurationMs)} ativo · {p ? formatScore(p) + (p.consultedText ? " (com consulta)" : "") : "Compreensão não avaliada"}
                    {s.difficulty !== "nao_classificada" && ` · ${DIFFICULTY_LABEL[s.difficulty]}`}
                  </p>
                </div>
                <button type="button" className="btn btn-quiet px-2 text-sm text-danger" onClick={() => void remove(s)}>
                  Excluir
                </button>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="mt-3 text-muted">Nenhuma sessão neste modo.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-serif text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
