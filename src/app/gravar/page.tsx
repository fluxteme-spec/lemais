"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dataCurta, guardar, hhmmss, listar, novaGravacao, recuperarRascunho, type Gravacao } from "@/lib/gravador/store";
import { lerAjustes } from "@/lib/gravador/ajustes";

export default function GravarPage() {
  const router = useRouter();
  const [lista, setLista] = useState<Gravacao[] | null>(null);
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const rec = await recuperarRascunho().catch(() => null);
      if (rec) setAviso("Recuperei uma gravação que não tinha sido finalizada.");
      setLista(await listar());
    })().catch(() => setLista([]));
  }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter((g) => !q || `${g.titulo} ${g.transcricao}`.toLowerCase().includes(q));
  }, [lista, busca]);

  async function importar(f: File) {
    const duracao = await new Promise<number>((ok) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => ok(Number.isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => ok(0);
      a.src = URL.createObjectURL(f);
    });
    const g = novaGravacao(f, duracao, { titulo: f.name.replace(/\.[^.]+$/, ""), template: lerAjustes().template });
    await guardar(g);
    router.push(`/gravar/${g.id}?transcrever=1`);
  }

  return (
    <div className="pt-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-bold">Gravar</h1>
          <p className="mt-3 max-w-prose">Grave reuniões, visitas e ideias. A transcrição e o resumo acontecem no seu aparelho.</p>
        </div>
        <Link href="/gravar/ajustes" className="btn btn-quiet shrink-0">
          Ajustes
        </Link>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Link
          href="/gravar/gravando"
          aria-label="Começar a gravar"
          className="grid h-28 w-28 place-items-center rounded-full bg-[#e5483b] shadow-[0_0_0_6px_var(--surface),0_0_0_8px_var(--line)]"
        >
          <span aria-hidden className="h-9 w-9 rounded-full bg-white" />
        </Link>
        <button type="button" className="btn btn-quiet" onClick={() => arquivo.current?.click()}>
          Importar áudio
        </button>
        <input
          ref={arquivo}
          type="file"
          accept="audio/*,video/mp4,.m4a,.mp3,.wav"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importar(f);
          }}
        />
      </div>

      {aviso && (
        <p role="status" className="mt-6 rounded-lg border border-line bg-surface p-3 text-sm">
          {aviso}
        </p>
      )}

      <section aria-labelledby="minhas" className="mt-10">
        <h2 id="minhas" className="font-semibold">
          Minhas gravações
        </h2>
        <input
          type="search"
          className="field mt-3"
          placeholder="Buscar nos títulos e transcrições"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar gravações"
        />
        {lista === null ? (
          <p className="mt-6 text-muted">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="mt-6 text-muted">{busca ? "Nada encontrado." : "Nenhuma gravação ainda. Toque no botão vermelho para começar."}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {filtradas.map((g) => (
              <li key={g.id}>
                <Link href={`/gravar/${g.id}`} className="block py-4">
                  <span className="block font-serif text-lg font-bold">{g.titulo}</span>
                  <span className="text-sm text-muted">
                    {dataCurta(g.criadoEm)} · {hhmmss(g.duracao)}
                    {g.resumo ? " · com resumo" : g.transcricao ? " · transcrita" : ""}
                  </span>
                  {g.transcricao && <span className="mt-1 line-clamp-2 block text-sm text-muted">{g.transcricao.slice(0, 160)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
