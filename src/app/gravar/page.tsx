"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@/components/Account";
import { lerAjustes } from "@/lib/gravador/ajustes";
import { importarDaEntrada, listarEntrada, meuToken, sincronizarGravacoes, type ItemEntrada } from "@/lib/gravador/nuvem";
import { dataCurta, guardar, hhmmss, listar, listarProjetos, novaGravacao, recuperarRascunho, type Gravacao, type Projeto } from "@/lib/gravador/store";
import { supabase } from "@/lib/supabase/browser";

export default function GravarPage() {
  const router = useRouter();
  const acc = useAccount();
  const [lista, setLista] = useState<Gravacao[] | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [filtroProjeto, setFiltroProjeto] = useState("");
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [entrada, setEntrada] = useState<ItemEntrada[]>([]);
  const [importando, setImportando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const recarregar = useCallback(async () => setLista(await listar()), []);

  useEffect(() => {
    (async () => {
      const rec = await recuperarRascunho().catch(() => null);
      if (rec) setAviso("Recuperei uma gravação que não tinha sido finalizada.");
      await recarregar();
      setProjetos(await listarProjetos());
    })().catch(() => setLista([]));
  }, [recarregar]);

  // logado: sincroniza o texto das gravações e olha a caixa de entrada dos Atalhos
  useEffect(() => {
    const sb = supabase();
    if (!sb || !acc.user || acc.needsOnboarding) return;
    const uid = acc.user.id;
    (async () => {
      const r = await sincronizarGravacoes(sb, uid).catch(() => null);
      if (r?.recebidas) await recarregar();
      const token = await meuToken(sb, uid, false).catch(() => null);
      if (token) setEntrada(await listarEntrada(sb, token).catch(() => []));
    })();
  }, [acc.user, acc.needsOnboarding, recarregar]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter(
      (g) => (!filtroProjeto || g.projetoId === filtroProjeto) && (!q || `${g.titulo} ${g.transcricao} ${g.saidas?.resumo ?? ""}`.toLowerCase().includes(q)),
    );
  }, [lista, busca, filtroProjeto]);

  async function importar(f: File) {
    const duracao = await new Promise<number>((ok) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => ok(Number.isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => ok(0);
      a.src = URL.createObjectURL(f);
    });
    const aj = lerAjustes();
    const g = novaGravacao(f, duracao, { titulo: f.name.replace(/\.[^.]+$/, ""), template: aj.template, personaId: aj.personaId, projetoId: aj.projetoId || undefined, origem: "importado" });
    await guardar(g);
    router.push(`/gravar/${g.id}?transcrever=1`);
  }

  async function importarEntrada() {
    const sb = supabase();
    if (!sb) return;
    setImportando(true);
    const aj = lerAjustes();
    let ultima: Gravacao | null = null;
    try {
      for (const item of entrada) ultima = await importarDaEntrada(sb, item, { template: aj.template, personaId: aj.personaId });
      setEntrada([]);
      await recarregar();
      if (entrada.length === 1 && ultima) router.push(`/gravar/${ultima.id}?transcrever=1`);
      else setAviso(`${entrada.length} áudios importados. Abra cada um para transcrever.`);
    } catch (e) {
      setAviso(`Não consegui importar: ${(e as Error).message}`);
    } finally {
      setImportando(false);
    }
  }

  const nomeProjeto = (id?: string) => projetos.find((p) => p.id === id);

  return (
    <div className="pt-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-bold">Gravar</h1>
          <p className="mt-3 max-w-prose">Grave reuniões, visitas e ideias. Transcreva no aparelho ou com a sua IA e gere resumo, tarefas, mapa 3D, ata e relatório.</p>
        </div>
      </div>

      <nav aria-label="Gravador" className="mt-4 flex flex-wrap gap-2">
        <Link href="/gravar/grafo" className="btn min-h-10 px-4 text-sm">
          Grafo Geral
        </Link>
        <Link href="/gravar/personas" className="btn min-h-10 px-4 text-sm">
          Personas e projetos
        </Link>
        <Link href="/gravar/ajustes" className="btn min-h-10 px-4 text-sm">
          Ajustes e Atalhos
        </Link>
      </nav>

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

      {entrada.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-marker bg-surface p-4">
          <p>
            <strong>{entrada.length}</strong> {entrada.length === 1 ? "áudio chegou" : "áudios chegaram"} pelo Atalho do iPhone.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void importarEntrada()} disabled={importando}>
            {importando ? "Importando…" : "Importar e transcrever"}
          </button>
        </div>
      )}

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
          placeholder="Buscar nos títulos, transcrições e resumos"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar gravações"
        />
        {projetos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por projeto">
            {[{ id: "", nome: "Todos", cor: "transparent" }, ...projetos].map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={filtroProjeto === p.id}
                onClick={() => setFiltroProjeto(p.id)}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line px-3 text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
              >
                {p.id && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: p.cor }} />}
                {p.nome}
              </button>
            ))}
          </div>
        )}
        {lista === null ? (
          <p className="mt-6 text-muted">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="mt-6 text-muted">{busca || filtroProjeto ? "Nada encontrado." : "Nenhuma gravação ainda. Toque no botão vermelho para começar."}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {filtradas.map((g) => {
              const pr = nomeProjeto(g.projetoId);
              return (
                <li key={g.id}>
                  <Link href={`/gravar/${g.id}`} className="block py-4">
                    <span className="block font-serif text-lg font-bold">{g.titulo}</span>
                    <span className="text-sm text-muted">
                      {dataCurta(g.criadoEm)} · {hhmmss(g.duracao)}
                      {pr && (
                        <>
                          {" · "}
                          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: pr.cor }} />
                          {pr.nome}
                        </>
                      )}
                      {g.saidas?.resumo ? " · com IA" : g.transcricao ? " · transcrita" : ""}
                      {!g.audio && " · só texto"}
                    </span>
                    {(g.saidas?.resumo || g.transcricao) && (
                      <span className="mt-1 line-clamp-2 block text-sm text-muted">{(g.saidas?.resumo ?? g.transcricao).replace(/[#*]/g, "").slice(0, 180)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
