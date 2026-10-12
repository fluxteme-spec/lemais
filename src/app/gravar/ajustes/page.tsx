"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lerAjustes, PADRAO, salvarAjustes, type AjustesGravador } from "@/lib/gravador/ajustes";
import { IDIOMAS, MODELOS_WHISPER } from "@/lib/gravador/transcrever";

export default function AjustesGravadorPage() {
  const [a, setA] = useState<AjustesGravador>(PADRAO);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [uso, setUso] = useState<string>("");
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    setA(lerAjustes());
    setOrigem(window.location.origin);
    const g = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    (g ? g.requestAdapter().then(Boolean).catch(() => false) : Promise.resolve(false)).then(setGpu);
    navigator.storage?.estimate?.().then((e) => setUso(`${Math.round((e.usage ?? 0) / 1e6)} MB usados neste aparelho`));
  }, []);

  const mudar = (m: Partial<AjustesGravador>) => setA(salvarAjustes(m));

  return (
    <div className="pt-6">
      <Link href="/gravar" className="btn btn-quiet -ml-4">
        ‹ Gravações
      </Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Ajustes do gravador</h1>

      <section className="mt-8 grid gap-4" aria-labelledby="t">
        <h2 id="t" className="font-semibold">
          Transcrição neste aparelho
        </h2>
        <label className="grid gap-1">
          Modelo
          <select className="field" value={a.modelo} onChange={(e) => mudar({ modelo: e.target.value })}>
            {MODELOS_WHISPER.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted">O modelo é baixado uma vez e fica guardado. Depois disso, transcreve até sem internet.</p>
        <label className="grid gap-1">
          Idioma da fala
          <select className="field" value={a.idioma} onChange={(e) => mudar({ idioma: e.target.value })}>
            {IDIOMAS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={a.auto} onChange={(e) => mudar({ auto: e.target.checked })} />
          Transcrever sozinho ao parar de gravar
        </label>
        {gpu !== null && (
          <p className="text-sm text-muted">
            {gpu ? "GPU disponível (WebGPU): transcrição rápida." : "Sem WebGPU neste navegador: a transcrição usa a CPU e fica mais lenta."}
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="atalho-gravar">
        <h2 id="atalho-gravar" className="font-semibold">
          Gravar pelo Botão de Ação ou pela Siri
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            No app <b>Atalhos</b>, toque em <b>+</b> e dê o nome <b>Gravar no LêMais</b>.
          </li>
          <li>
            Adicione <b>Abrir URLs</b> com o endereço <code className="rounded bg-surface px-1">{origem || "https://…"}/gravar/gravando</code>.
          </li>
          <li>
            Em <b>Ajustes › Botão de Ação</b>, escolha <b>Atalho › Gravar no LêMais</b>. Ou diga “E aí Siri, Gravar no LêMais”.
          </li>
        </ol>
        <p className="mt-2 text-sm text-muted">
          A gravação começa assim que a página abre. Para gravar com a tela bloqueada, o envio direto do gravador nativo chega numa próxima atualização.
        </p>
      </section>

      <section className="mt-10 grid gap-3" aria-labelledby="ai">
        <h2 id="ai" className="font-semibold">
          Resumo com Apple Intelligence
        </h2>
        <label className="grid gap-1">
          Nome do atalho
          <input className="field" value={a.atalho} onChange={(e) => mudar({ atalho: e.target.value || PADRAO.atalho })} />
        </label>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            No app <b>Atalhos</b>, toque em <b>+</b> e dê o nome <b>{a.atalho}</b>.
          </li>
          <li>
            Adicione <b>Obter Área de Transferência</b>.
          </li>
          <li>
            Adicione <b>Usar Modelo</b>, escolha <b>No Dispositivo</b> e, no pedido, insira a variável <b>Área de Transferência</b>.
          </li>
          <li>
            Adicione <b>Copiar para Área de Transferência</b> com a <b>Resposta</b> do modelo.
          </li>
          <li>
            Na gravação, toque em <b>Apple Intelligence</b>. Quando o atalho terminar, volte e toque em <b>Colar o resumo</b>.
          </li>
        </ol>
        <p className="text-sm text-muted">
          O modelo “No Dispositivo” aceita uns 10 minutos de fala. Para gravações longas, escolha <b>Private Cloud Compute</b>, que roda nos servidores
          privados da Apple.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="arm">
        <h2 id="arm" className="font-semibold">
          Armazenamento
        </h2>
        <p className="mt-2 text-sm text-muted">{uso}</p>
        <p className="mt-1 text-sm text-muted">Áudio, texto e resumos ficam só neste aparelho.</p>
      </section>
    </div>
  );
}
