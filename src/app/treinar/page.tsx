"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TRAINING_TEXTS } from "@/lib/training";
import { DIFFICULTY_LABEL } from "@/lib/session";
import { countWords } from "@/lib/text";
import { listSuggestedTexts, openSuggestedText, openTrainingText, type SuggestedText } from "@/lib/client/actions";
import { AdSlot } from "@/components/AdSlot";
import { useAppState } from "@/components/AppState";

const LEVELS = [
  { id: "facil", title: "Fáceis" },
  { id: "intermediario", title: "Intermediários" },
  { id: "avancado", title: "Avançados" },
] as const;

export default function TrainPage() {
  const router = useRouter();
  const { reportStorageError } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<SuggestedText[]>([]);
  useEffect(() => {
    listSuggestedTexts().then(setSuggested).catch(() => {});
  }, []);

  async function openSuggested(t: SuggestedText) {
    setBusy(t.id);
    try {
      const c = await openSuggestedText(t);
      router.push(`/preparar/${c.id}`);
    } catch (e) {
      reportStorageError(e);
      setBusy(null);
    }
  }

  async function open(id: string) {
    setBusy(id);
    try {
      const c = await openTrainingText(id);
      router.push(`/preparar/${c.id}`);
    } catch (e) {
      reportStorageError(e);
      setBusy(null);
    }
  }

  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">Treinar</h1>
      <p className="mt-3 max-w-prose">
        Textos originais, escritos para o LêMais, cada um com perguntas revisadas. Use-os para comparar modos e ritmos em condições parecidas.
      </p>
      <p className="mt-1 max-w-prose text-sm text-muted">O nível de dificuldade é uma classificação editorial aproximada.</p>

      {suggested.length > 0 && (
        <section aria-labelledby="sugestoes" className="mt-10">
          <h2 id="sugestoes" className="font-semibold">
            Sugestões da equipe
          </h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {suggested.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-xl font-bold">{t.title}</p>
                  <p className="text-sm text-muted">
                    {[t.summary, t.author, `${countWords(t.blocks)} palavras`, t.questions?.length ? `${t.questions.length} perguntas` : "sem perguntas prontas", t.difficulty !== "nao_classificada" ? DIFFICULTY_LABEL[t.difficulty] : null]
                      .filter(Boolean)
                      .join(". ")}
                    .
                  </p>
                </div>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void openSuggested(t)}>
                  {busy === t.id ? "Abrindo…" : "Preparar leitura"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {LEVELS.map((lvl) => (
        <section key={lvl.id} aria-labelledby={`n-${lvl.id}`} className="mt-10">
          <h2 id={`n-${lvl.id}`} className="font-semibold">
            {lvl.title}
          </h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {TRAINING_TEXTS.filter((t) => t.difficulty === lvl.id).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-xl font-bold">{t.title}</p>
                  <p className="text-sm text-muted">
                    {t.summary} {countWords(t.blocks)} palavras, 3 perguntas. {DIFFICULTY_LABEL[t.difficulty]}.
                  </p>
                </div>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void open(t.id)}>
                  {busy === t.id ? "Abrindo…" : "Preparar leitura"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <AdSlot placement="treinar" />
    </div>
  );
}
