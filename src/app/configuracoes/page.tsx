"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { repo, DEFAULT_SETTINGS } from "@/lib/persistence";
import { useAppState } from "@/components/AppState";
import { Toggle, WpmControl } from "@/components/Controls";
import { aiAvailable } from "@/lib/client/actions";
import type { Content } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const { settings, updateSettings, reportStorageError } = useAppState();
  const [contents, setContents] = useState<Content[]>([]);
  const [ai, setAi] = useState<boolean | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const loadContents = () => repo().listContents().then(setContents).catch(reportStorageError);
  useEffect(() => {
    void loadContents();
    aiAvailable().then(setAi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeContent(c: Content) {
    if (!confirm(`Excluir “${c.title}”? As sessões e questionários desse texto também serão apagados.`)) return;
    await repo().deleteContent(c.id).catch(reportStorageError);
    setDone(`“${c.title}” foi excluído.`);
    void loadContents();
  }

  async function clearAll() {
    if (!confirm("Apagar todos os dados do LêMais neste navegador? Textos, sessões, questionários e preferências serão removidos. Não é possível desfazer.")) return;
    try {
      await repo().clearAll();
      await updateSettings(DEFAULT_SETTINGS);
      setContents([]);
      setDone("Todos os dados locais foram apagados.");
      router.refresh();
    } catch (e) {
      reportStorageError(e);
    }
  }

  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">Configurações</h1>
      {done && (
        <p role="status" className="mt-4 border-l-4 border-ok pl-3">
          {done}
        </p>
      )}

      <section aria-labelledby="leitura" className="mt-8 space-y-6">
        <h2 id="leitura" className="font-semibold">
          Leitura e aparência
        </h2>
        <fieldset>
          <legend className="mb-2 font-medium">Tema</legend>
          <div className="flex flex-wrap gap-2">
            {(["sistema", "claro", "escuro"] as const).map((t) => (
              <label key={t} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-4 capitalize has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus">
                <input type="radio" name="tema" className="sr-only" checked={settings.theme === t} onChange={() => void updateSettings({ theme: t })} />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        <WpmControl value={settings.targetWpm} onChange={(targetWpm) => void updateSettings({ targetWpm })} />
        <div>
          <label htmlFor="fonte" className="mb-1 block font-medium">
            Tamanho do texto no leitor: {settings.fontSize}px
          </label>
          <input id="fonte" type="range" min={24} max={72} step={2} value={settings.fontSize} onChange={(e) => void updateSettings({ fontSize: Number(e.target.value) })} className="w-full" />
          <p className="reading-text mt-1" style={{ fontSize: Math.max(16, settings.fontSize * 0.5), lineHeight: settings.lineSpacing }}>
            Exemplo de texto com o tamanho e o espaçamento escolhidos.
          </p>
        </div>
        <div>
          <label htmlFor="entrelinha" className="mb-1 block font-medium">
            Espaçamento entre linhas: {settings.lineSpacing.toFixed(1)}
          </label>
          <input id="entrelinha" type="range" min={1.2} max={2.4} step={0.1} value={settings.lineSpacing} onChange={(e) => void updateSettings({ lineSpacing: Number(e.target.value) })} className="w-full" />
        </div>
        <Toggle checked={settings.smartPauses} onChange={(smartPauses) => void updateSettings({ smartPauses })} label="Pausas inteligentes por padrão" />
        <Toggle
          checked={settings.referenceLetterHighlight}
          onChange={(referenceLetterHighlight) => void updateSettings({ referenceLetterHighlight })}
          label="Destacar letra de referência no modo palavra a palavra"
          hint="Preferência visual, sem promessa de benefício."
        />
      </section>

      <section aria-labelledby="metricas" className="mt-12">
        <h2 id="metricas" className="font-semibold">
          Como as métricas funcionam
        </h2>
        <dl className="mt-3 max-w-prose space-y-3 text-[0.95rem]">
          <div>
            <dt className="font-medium">Ritmo configurado</dt>
            <dd className="text-muted">A velocidade escolhida nos controles, em palavras por minuto (PPM).</dd>
          </div>
          <div>
            <dt className="font-medium">Ritmo observado</dt>
            <dd className="text-muted">Palavras apresentadas divididas pelos minutos ativos. Inclui as pausas inteligentes; não inclui pausas manuais nem o tempo com a aba oculta. No texto livre é uma estimativa: total de palavras ÷ tempo ativo.</dd>
          </div>
          <div>
            <dt className="font-medium">Cobertura apresentada</dt>
            <dd className="text-muted">Quantas posições do texto foram exibidas pelo leitor. Pular trechos não conta. Não é o mesmo que palavras lidas: o app não tem como verificar isso.</dd>
          </div>
          <div>
            <dt className="font-medium">Compreensão imediata</dt>
            <dd className="text-muted">Acertos no questionário logo após a leitura. Sem teste, fica “não avaliada” e não entra nas médias. Testes com consulta ao texto são contados à parte.</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="dados" className="mt-12">
        <h2 id="dados" className="font-semibold">
          Seus dados
        </h2>
        <p className="mt-2 max-w-prose">
          Tudo fica salvo apenas neste navegador, sem cadastro. Nada é sincronizado entre dispositivos; limpar os dados do navegador apaga o seu histórico.
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Ao importar um link, o servidor do LêMais baixa a página só para extrair o texto e não a guarda.{" "}
          {ai === null
            ? ""
            : ai
              ? "A geração automática de perguntas está ativa: quando você pedir um teste para um texto colado ou importado, o texto é enviado ao provedor de IA configurado (Anthropic). O LêMais não guarda esse texto; o tempo de retenção no provedor segue a política de dados da API dele."
              : "A geração automática de perguntas não está ativa nesta instalação; nenhum texto é enviado a provedores de IA."}
        </p>

        <h3 className="mt-6 font-medium">Textos salvos</h3>
        {contents.length === 0 ? (
          <p className="mt-1 text-muted">Nenhum texto salvo.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {contents.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{c.title}</span>
                <button type="button" className="btn btn-quiet px-2 text-sm text-danger" onClick={() => void removeContent(c)}>
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="btn btn-danger mt-6" onClick={() => void clearAll()}>
          Apagar todos os dados locais
        </button>
      </section>
    </div>
  );
}
