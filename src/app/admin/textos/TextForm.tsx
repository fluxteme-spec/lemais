"use client";

import { useActionState, useState } from "react";
import { saveSuggestedText, type ActionResult } from "../actions";
import { blocksToPlainText, parsePlainText } from "@/lib/text";
import { getConnection } from "@/lib/ai/connection";
import { browserProvider } from "@/lib/ai/providers";
import { generateQuestionSet } from "@/lib/comprehension/generate";
import { TEXT_LIMITS } from "@/lib/config";
import type { CuratedQuestion, TextBlock } from "@/lib/types";

export interface SuggestedRow {
  id: string;
  title: string;
  author: string | null;
  source: string | null;
  summary: string | null;
  difficulty: string;
  blocks: TextBlock[];
  questions: CuratedQuestion[] | null;
  published: boolean;
}

const EMPTY: CuratedQuestion = { prompt: "", options: ["", "", "", ""], correctOption: 0, explanation: "", evidence: "" };
const FOCUS = ["ideia_central", "desenvolvimento", "conclusao"] as const;
const FOCUS_LABEL = ["Ideia central", "Desenvolvimento", "Conclusão"];

export function TextForm({ row, onDone }: { row?: SuggestedRow; onDone?: (message: string) => void }) {
  const [text, setText] = useState(row ? blocksToPlainText(row.blocks) : "");
  const [title, setTitle] = useState(row?.title ?? "");
  const [qs, setQs] = useState<CuratedQuestion[]>(() => {
    const base = row?.questions ?? [];
    return [0, 1, 2].map((i) => ({ ...EMPTY, ...(base[i] ?? {}), options: [...(base[i]?.options ?? EMPTY.options)], focus: FOCUS[i] }));
  });
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    const r = await saveSuggestedText(prev, form);
    if (r.ok) onDone?.(r.message);
    return r;
  }, null);

  const filled = qs.filter((q) => q.prompt.trim());
  const set = (i: number, patch: Partial<CuratedQuestion>) => setQs((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function suggest() {
    setAiMsg(null);
    const conn = await getConnection();
    if (!conn) return setAiMsg("Conecte sua IA em Conectar IA para sugerir perguntas.");
    const blocks = parsePlainText(text);
    setAiMsg("Gerando perguntas com a sua IA…");
    try {
      const set = await generateQuestionSet(browserProvider(conn), { contentId: "admin", contentVersion: 1, title, blocks }, TEXT_LIMITS.minWordsForQuiz);
      setQs([0, 1, 2].map((i) => {
        const q = set.questions[i];
        return q
          ? { prompt: q.prompt, options: q.options, correctOption: q.correctOption, explanation: q.explanation, evidence: q.evidence, focus: FOCUS[i] }
          : { ...EMPTY, options: ["", "", "", ""], focus: FOCUS[i] };
      }));
      setAiMsg("Perguntas sugeridas. Revise antes de publicar.");
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : "Não foi possível gerar as perguntas.");
    }
  }

  return (
    <form action={action} className="space-y-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="questions" value={filled.length ? JSON.stringify(filled) : ""} />
      <label className="block">
        <span className="mb-1 block font-medium">Título</span>
        <input name="title" required maxLength={200} className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Autoria (opcional)</span>
          <input name="author" maxLength={120} defaultValue={row?.author ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Fonte ou link (opcional)</span>
          <input name="source" maxLength={300} defaultValue={row?.source ?? ""} className="field" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Resumo curto (aparece na lista)</span>
          <input name="summary" maxLength={300} defaultValue={row?.summary ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Dificuldade (aproximada)</span>
          <select name="difficulty" defaultValue={row?.difficulty ?? "nao_classificada"} className="field">
            <option value="facil">Fácil</option>
            <option value="intermediario">Intermediário</option>
            <option value="avancado">Avançado</option>
            <option value="nao_classificada">Não classificada</option>
          </select>
        </label>
      </div>
      <div>
        <label htmlFor="adm-texto" className="mb-1 block font-medium">
          Texto
        </label>
        <textarea id="adm-texto" name="text" required rows={10} aria-describedby="adm-texto-ajuda" className="field reading-text text-base leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        <p id="adm-texto-ajuda" className="text-sm text-muted">
          Separe parágrafos com uma linha em branco. Linhas começando com ## viram intertítulos. Publique só textos seus ou com autorização.
        </p>
      </div>

      <fieldset className="rounded-xl border-[1.5px] border-line p-4">
        <legend className="px-1 font-semibold">Perguntas (até 3, opcional)</legend>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn px-3 text-sm" onClick={() => void suggest()} disabled={!text.trim()}>
            Sugerir com minha IA
          </button>
          {aiMsg && (
            <span role="status" className="text-sm text-muted">
              {aiMsg}
            </span>
          )}
        </div>
        {qs.map((q, i) => (
          <div key={i} className="mt-5 space-y-2 border-t border-line pt-4">
            <p className="font-medium">
              {i + 1}. {FOCUS_LABEL[i]}
            </p>
            <input aria-label={`Pergunta ${i + 1}`} placeholder="Enunciado curto" className="field" value={q.prompt} onChange={(e) => set(i, { prompt: e.target.value })} maxLength={200} />
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o, oi) => (
                <label key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`correta-${i}`} checked={q.correctOption === oi} onChange={() => set(i, { correctOption: oi })} className="size-5 shrink-0 accent-[var(--ink)]" aria-label={`Alternativa ${oi + 1} é a correta`} />
                  <input
                    aria-label={`Alternativa ${oi + 1} da pergunta ${i + 1}`}
                    placeholder={`Alternativa ${oi + 1}`}
                    className="field"
                    value={o}
                    maxLength={160}
                    onChange={(e) => set(i, { options: q.options.map((x, xi) => (xi === oi ? e.target.value : x)) })}
                  />
                </label>
              ))}
            </div>
            <input aria-label={`Explicação ${i + 1}`} placeholder="Por que a correta está certa" className="field" value={q.explanation} onChange={(e) => set(i, { explanation: e.target.value })} maxLength={600} />
            <input aria-label={`Evidência ${i + 1}`} placeholder="Trecho copiado do texto que comprova a resposta" className="field" value={q.evidence} onChange={(e) => set(i, { evidence: e.target.value })} maxLength={600} />
          </div>
        ))}
        <p className="mt-3 text-sm text-muted">Marque a alternativa correta no círculo. A evidência precisa ser um trecho copiado do texto.</p>
      </fieldset>

      <label className="inline-flex min-h-11 items-center gap-2">
        <input type="checkbox" name="published" defaultChecked={row?.published ?? false} className="size-5 accent-[var(--ink)]" />
        Publicar em Treinar
      </label>
      {state && (
        <p role="status" className={state.ok ? "text-ok" : "text-danger"}>
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando…" : row ? "Salvar alterações" : "Salvar texto"}
        </button>
      </div>
    </form>
  );
}
