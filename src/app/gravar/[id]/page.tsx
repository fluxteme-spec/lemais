"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apagar, dataCurta, guardar, hhmmss, pegar, type Gravacao } from "@/lib/gravador/store";
import { resumoEmTexto } from "@/lib/gravador/resumo";
import { MODELOS, montarPrompt } from "@/lib/gravador/modelos";
import { lerAjustes, salvarAjustes } from "@/lib/gravador/ajustes";
import { transcreverNoAparelho, transcrevendoAgora, type MensagemDoWorker } from "@/lib/gravador/transcrever";
import { Markdown } from "@/components/gravador/Markdown";

type Progresso = { fracao: number | null; rotulo: string };

export default function GravacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const busca = useSearchParams();
  const [g, setG] = useState<Gravacao | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [aguardandoAtalho, setAguardandoAtalho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  const autoIniciou = useRef(false);

  const atualizar = useCallback(async (mudanca: Partial<Gravacao>) => {
    setG((atual) => {
      if (!atual) return atual;
      const novo = { ...atual, ...mudanca, atualizadoEm: Date.now() };
      void guardar(novo);
      return novo;
    });
  }, []);

  useEffect(() => {
    let vivo = true;
    let u: string | null = null;
    pegar(id)
      .then((x) => {
        if (!vivo) return;
        setG(x ?? null);
        if (x) {
          u = URL.createObjectURL(x.audio);
          setUrl(u);
        }
      })
      .catch(() => vivo && setG(null));
    return () => {
      vivo = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);

  const transcrever = useCallback(async () => {
    if (!g || transcrevendoAgora()) return;
    const { modelo, idioma } = lerAjustes();
    const t0 = Date.now();
    const baixados = new Map<string, [number, number]>();
    setProgresso({ fracao: null, rotulo: "Preparando o áudio…" });
    try {
      const segmentos = await transcreverNoAparelho(g.audio, { modelo, idioma }, (m: MensagemDoWorker) => {
        if (m.tipo === "download") {
          baixados.set(m.arquivo, [m.carregado, m.total]);
          let c = 0;
          let t = 0;
          for (const [a, b] of baixados.values()) (c += a), (t += b);
          setProgresso({ fracao: c / t, rotulo: `Baixando o modelo (só na 1ª vez): ${Math.round(c / 1e6)} de ${Math.round(t / 1e6)} MB` });
        } else if (m.tipo === "pronto") {
          setProgresso({ fracao: 0, rotulo: m.dispositivo === "webgpu" ? "Transcrevendo com a GPU do aparelho…" : "Transcrevendo…" });
        } else if (m.tipo === "progresso") {
          const passou = (Date.now() - t0) / 1000;
          const falta = m.fracao > 0.05 ? (passou / m.fracao) * (1 - m.fracao) : null;
          setProgresso({ fracao: m.fracao, rotulo: `Transcrevendo… ${Math.round(m.fracao * 100)}%${falta ? ` · falta ~${hhmmss(falta)}` : ""}` });
          setG((atual) => (atual ? { ...atual, segmentos: m.segmentos, transcricao: m.segmentos.map((s) => s.texto).join(" ") } : atual));
        }
      });
      const transcricao = segmentos.map((s) => s.texto).join(" ");
      await atualizar({ segmentos, transcricao, resumo: transcricao ? resumoEmTexto(transcricao) : "" });
      setAviso(transcricao ? "Transcrição pronta." : "Não encontrei fala neste áudio.");
    } catch (e) {
      setAviso(`Não consegui transcrever: ${(e as Error).message}`);
    } finally {
      setProgresso(null);
    }
  }, [g, atualizar]);

  // vindo do botão Parar ou de uma importação: transcreve sozinho se estiver ligado nos ajustes
  useEffect(() => {
    if (!g || autoIniciou.current || g.transcricao || busca.get("transcrever") !== "1") return;
    autoIniciou.current = true;
    router.replace(`/gravar/${g.id}`);
    if (lerAjustes().auto) void transcrever();
  }, [g, busca, router, transcrever]);

  if (g === undefined) return <p className="pt-10 text-muted">Carregando…</p>;
  if (g === null)
    return (
      <div className="pt-10">
        <p>Gravação não encontrada neste aparelho.</p>
        <Link href="/gravar" className="btn mt-4">
          Voltar às gravações
        </Link>
      </div>
    );

  const segs = g.segmentos.length ? g.segmentos : g.transcricao ? [{ inicio: 0, fim: 0, texto: g.transcricao }] : [];

  async function resumirComApple() {
    if (!g) return;
    const prompt = montarPrompt(g.template, g.transcricao);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      return setAviso("Não consegui copiar o texto para o atalho.");
    }
    setAguardandoAtalho(prompt);
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(lerAjustes().atalho)}&input=clipboard`;
  }

  async function colarResumo() {
    let texto = "";
    try {
      texto = (await navigator.clipboard.readText()).trim();
    } catch {
      return setAviso("Permita colar quando o iPhone perguntar.");
    }
    if (!texto || texto === aguardandoAtalho) return setAviso("O atalho ainda não devolveu o resumo.");
    await atualizar({ resumo: texto });
    setAguardandoAtalho(null);
    setAviso("Resumo do Apple Intelligence salvo.");
  }

  async function compartilharTexto() {
    if (!g) return;
    const texto = [g.titulo, dataCurta(g.criadoEm), g.resumo, g.transcricao && `## Transcrição\n${g.transcricao}`].filter(Boolean).join("\n\n");
    try {
      await navigator.share({ title: g.titulo, text: texto });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        await navigator.clipboard?.writeText(texto).catch(() => {});
        setAviso("Texto copiado.");
      }
    }
  }

  async function compartilharAudio() {
    if (!g) return;
    const ext = g.mime.includes("mp4") ? "m4a" : g.mime.includes("webm") ? "webm" : (g.audio as File).name?.split(".").pop() || "audio";
    const arq = new File([g.audio], `${g.titulo}.${ext}`, { type: g.mime || g.audio.type });
    try {
      if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: g.titulo });
      else setAviso("Este navegador não compartilha arquivos.");
    } catch {}
  }

  async function excluir() {
    if (!g || !confirm("Excluir esta gravação? Não dá para desfazer.")) return;
    await apagar(g.id);
    router.replace("/gravar");
  }

  return (
    <div className="pt-6">
      <Link href="/gravar" className="btn btn-quiet -ml-4">
        ‹ Gravações
      </Link>
      <input
        className="mt-2 w-full bg-transparent font-serif text-3xl font-bold outline-none"
        aria-label="Título"
        defaultValue={g.titulo}
        onBlur={(e) => {
          const t = e.target.value.trim();
          if (t && t !== g.titulo) void atualizar({ titulo: t });
        }}
      />
      <p className="text-sm text-muted">
        {dataCurta(g.criadoEm)} · {hhmmss(g.duracao)}
      </p>
      {url && <audio ref={player} src={url} controls preload="metadata" className="mt-4 w-full" />}

      {!g.transcricao && !progresso && (
        <button type="button" className="btn btn-primary mt-6 w-full" onClick={() => void transcrever()}>
          Transcrever neste aparelho
        </button>
      )}
      {progresso && (
        <div className="mt-6 grid gap-2" role="status">
          <progress className="h-2 w-full accent-ink" value={progresso.fracao ?? undefined} max={1} />
          <span className="text-sm text-muted">{progresso.rotulo}</span>
        </div>
      )}

      {aviso && (
        <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">
          {aviso}
        </p>
      )}

      {g.transcricao && !progresso && (
        <section aria-labelledby="resumo" className="mt-8">
          <h2 id="resumo" className="font-semibold">
            Resumo
          </h2>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <select
              className="field"
              aria-label="Tipo de resumo"
              value={g.template}
              onChange={(e) => {
                void atualizar({ template: e.target.value });
                salvarAjustes({ template: e.target.value });
              }}
            >
              {Object.entries(MODELOS).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.nome}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" onClick={() => void resumirComApple()}>
              Apple Intelligence
            </button>
          </div>
          {aguardandoAtalho && (
            <button type="button" className="btn mt-2 w-full" onClick={() => void colarResumo()}>
              Colar o resumo que o Atalho gerou
            </button>
          )}
          <button type="button" className="btn btn-quiet mt-1" onClick={() => void atualizar({ resumo: resumoEmTexto(g.transcricao) })}>
            Refazer resumo rápido (sem IA)
          </button>
          <div className="mt-2 rounded-xl border border-line bg-surface px-4 py-3">
            {g.resumo ? <Markdown texto={g.resumo} /> : <p className="text-muted">Ainda sem resumo.</p>}
          </div>
        </section>
      )}

      <section aria-labelledby="transcricao" className="mt-8">
        <div className="flex items-center justify-between">
          <h2 id="transcricao" className="font-semibold">
            Transcrição
          </h2>
          {g.transcricao && !progresso && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                if (editando === null) return setEditando(g.transcricao);
                void atualizar({ transcricao: editando.trim(), segmentos: [] });
                setEditando(null);
              }}
            >
              {editando === null ? "Editar texto" : "Salvar texto"}
            </button>
          )}
        </div>
        {editando !== null ? (
          <textarea className="field mt-2 min-h-[50dvh] leading-relaxed" value={editando} onChange={(e) => setEditando(e.target.value)} />
        ) : segs.length ? (
          <div className="reading-text mt-2 text-lg leading-relaxed">
            {segs.map((s, i) => (
              <p key={i} className="my-3">
                <button
                  type="button"
                  className="mr-2 rounded border border-line px-1.5 align-[2px] font-sans text-xs font-semibold tabular-nums text-muted"
                  onClick={() => {
                    if (!player.current) return;
                    player.current.currentTime = s.inicio;
                    void player.current.play();
                  }}
                  aria-label={`Ouvir a partir de ${hhmmss(s.inicio)}`}
                >
                  {hhmmss(s.inicio)}
                </button>
                {s.texto}
              </p>
            ))}
          </div>
        ) : (
          !progresso && <p className="mt-2 text-muted">Toque em “Transcrever” para gerar o texto. Tudo acontece no seu aparelho.</p>
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => void compartilharTexto()}>
          Compartilhar texto
        </button>
        <button type="button" className="btn" onClick={() => void compartilharAudio()}>
          Compartilhar áudio
        </button>
        <button type="button" className="btn btn-quiet text-danger" onClick={() => void excluir()}>
          Excluir
        </button>
      </div>
    </div>
  );
}
