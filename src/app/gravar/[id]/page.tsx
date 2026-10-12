"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@/components/Account";
import { Markdown } from "@/components/gravador/Markdown";
import { Grafo3D, type Grafo3DRef } from "@/components/gravador/Grafo3D";
import { lerAjustes, salvarAjustes } from "@/lib/gravador/ajustes";
import { gerarSaida, type TipoSaida } from "@/lib/gravador/ia";
import { grafoDaGravacao, type NoGrafo } from "@/lib/gravador/grafo";
import { MODELOS, montarPrompt } from "@/lib/gravador/modelos";
import { criarLinkPublico, sincronizarGravacoes } from "@/lib/gravador/nuvem";
import { personasComPadrao } from "@/lib/gravador/personas";
import { resumoEmTexto } from "@/lib/gravador/resumo";
import { apagar, dataCurta, guardar, hhmmss, listarProjetos, pegar, type Gravacao, type Persona, type Projeto, type Segmento } from "@/lib/gravador/store";
import { audioPara16k, transcreverNoAparelho, transcrevendoAgora, type MensagemDoWorker } from "@/lib/gravador/transcrever";
import { aceitaAudio, transcreverComIA } from "@/lib/gravador/transcreverNuvem";
import { useIA } from "@/lib/gravador/useIA";
import { supabase } from "@/lib/supabase/browser";

type Aba = "resumo" | "tarefas" | "mapa" | "ata" | "relatorio" | "transcricao";
const ABAS: { id: Aba; nome: string }[] = [
  { id: "resumo", nome: "Resumo" },
  { id: "tarefas", nome: "Tarefas" },
  { id: "mapa", nome: "Mapa 3D" },
  { id: "ata", nome: "Ata" },
  { id: "relatorio", nome: "Relatório" },
  { id: "transcricao", nome: "Transcrição" },
];

type Progresso = { fracao: number | null; rotulo: string };

function textoDasTarefas(g: Gravacao): string {
  return (g.saidas?.tarefas ?? []).map((t) => `${t.feita ? "☑" : "☐"} ${t.texto}${t.responsavel ? ` — ${t.responsavel}` : ""}${t.prazo ? ` (${t.prazo})` : ""}`).join("\n");
}

function textoDaTranscricao(segs: Segmento[], bruto: string): string {
  return segs.length ? segs.map((s) => `[${hhmmss(s.inicio)}] ${s.falante ? `${s.falante}: ` : ""}${s.texto}`).join("\n") : bruto;
}

export default function GravacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const busca = useSearchParams();
  const acc = useAccount();
  const ia = useIA();
  const [g, setG] = useState<Gravacao | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("resumo");
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [gerando, setGerando] = useState<TipoSaida | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [aguardandoAtalho, setAguardandoAtalho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [noEscolhido, setNoEscolhido] = useState<NoGrafo | null>(null);
  const [link, setLink] = useState<{ url: string; expira: string } | null>(null);
  const [dias, setDias] = useState(7);
  const player = useRef<HTMLAudioElement>(null);
  const grafo = useRef<Grafo3DRef>(null);
  const autoIniciou = useRef(false);
  const gRef = useRef(g);
  gRef.current = g;

  const atualizar = useCallback(async (mudanca: Partial<Gravacao>) => {
    const atual = gRef.current;
    if (!atual) return;
    const novo = { ...atual, ...mudanca, atualizadoEm: Date.now() };
    gRef.current = novo;
    setG(novo);
    await guardar(novo);
  }, []);

  useEffect(() => {
    personasComPadrao().then(setPersonas).catch(() => {});
    listarProjetos().then(setProjetos).catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    let u: string | null = null;
    pegar(id)
      .then((x) => {
        if (!vivo) return;
        setG(x ?? null);
        if (x?.audio) {
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

  const persona = useMemo(() => personas.find((p) => p.id === (g?.personaId ?? lerAjustes().personaId)), [personas, g?.personaId]);

  const gerar = useCallback(
    async (tipo: TipoSaida, semPerguntar = false) => {
      const atual = gRef.current;
      if (!atual || !ia.conn) return;
      if (!semPerguntar && !(await ia.autorizar("texto"))) return;
      setGerando(tipo);
      setAviso(null);
      try {
        const p = personas.find((x) => x.id === (atual.personaId ?? lerAjustes().personaId));
        const nova = await gerarSaida(ia.conn, atual, p, tipo);
        await atualizar({ saidas: { ...gRef.current?.saidas, ...nova } });
      } catch (e) {
        setAviso(`A IA não conseguiu gerar: ${(e as Error).message}`);
      } finally {
        setGerando(null);
      }
    },
    [ia, personas, atualizar],
  );

  const transcrever = useCallback(
    async (motor: "aparelho" | "ia") => {
      const atual = gRef.current;
      if (!atual?.audio || transcrevendoAgora()) return;
      const { modelo, idioma, autoIA } = lerAjustes();
      if (motor === "ia" && !(await ia.autorizar("áudio"))) return;
      const t0 = Date.now();
      const falta = (fr: number) => (fr > 0.05 ? ` · falta ~${hhmmss(((Date.now() - t0) / 1000 / fr) * (1 - fr))}` : "");
      setProgresso({ fracao: null, rotulo: "Preparando o áudio…" });
      setAviso(null);
      try {
        let segmentos: Segmento[];
        if (motor === "ia" && ia.conn) {
          const pcm = await audioPara16k(atual.audio);
          setProgresso({ fracao: 0, rotulo: `Enviando para ${ia.nome}…` });
          segmentos = await transcreverComIA(ia.conn, pcm, idioma, (fr, segs) => {
            setProgresso({ fracao: fr, rotulo: `Transcrevendo com ${ia.nome}… ${Math.round(fr * 100)}%${falta(fr)}` });
            setG((x) => (x ? { ...x, segmentos: segs, transcricao: segs.map((s) => s.texto).join(" ") } : x));
          });
        } else {
          const baixados = new Map<string, [number, number]>();
          segmentos = await transcreverNoAparelho(atual.audio, { modelo, idioma }, (m: MensagemDoWorker) => {
            if (m.tipo === "download") {
              baixados.set(m.arquivo, [m.carregado, m.total]);
              let c = 0;
              let t = 0;
              for (const [a, b] of baixados.values()) (c += a), (t += b);
              setProgresso({ fracao: c / t, rotulo: `Baixando o modelo (só na 1ª vez): ${Math.round(c / 1e6)} de ${Math.round(t / 1e6)} MB` });
            } else if (m.tipo === "pronto") {
              setProgresso({ fracao: 0, rotulo: m.dispositivo === "webgpu" ? "Transcrevendo com a GPU do aparelho…" : "Transcrevendo…" });
            } else if (m.tipo === "progresso") {
              setProgresso({ fracao: m.fracao, rotulo: `Transcrevendo… ${Math.round(m.fracao * 100)}%${falta(m.fracao)}` });
              setG((x) => (x ? { ...x, segmentos: m.segmentos, transcricao: m.segmentos.map((s) => s.texto).join(" ") } : x));
            }
          });
        }
        const transcricao = segmentos.map((s) => s.texto).join(" ");
        await atualizar({ segmentos, transcricao, resumo: transcricao ? resumoEmTexto(transcricao) : "" });
        setProgresso(null);
        if (!transcricao) return setAviso("Não encontrei fala neste áudio.");
        if (ia.conn && autoIA) await gerar("essencial", motor === "ia");
        else setAviso("Transcrição pronta.");
      } catch (e) {
        setProgresso(null);
        setAviso(`Não consegui transcrever: ${(e as Error).message}`);
      }
    },
    [ia, atualizar, gerar],
  );

  // vindo do Parar, de uma importação ou da caixa de entrada: transcreve sozinho se ligado nos ajustes
  useEffect(() => {
    if (!g || ia.conn === undefined || autoIniciou.current || g.transcricao || !g.audio || busca.get("transcrever") !== "1") return;
    autoIniciou.current = true;
    router.replace(`/gravar/${g.id}`);
    const a = lerAjustes();
    if (a.auto) void transcrever(a.motor === "ia" && aceitaAudio(ia.conn) ? "ia" : "aparelho");
  }, [g, ia.conn, busca, router, transcrever]);

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

  const s = g.saidas ?? {};
  const segs = g.segmentos.length ? g.segmentos : g.transcricao ? [{ inicio: 0, fim: 0, texto: g.transcricao }] : [];
  const temIA = !!ia.conn;

  function textoDaAba(): string {
    if (!g) return "";
    const cab = `${g.titulo}\n${dataCurta(g.criadoEm)} · ${hhmmss(g.duracao)}\n\n`;
    if (aba === "resumo") return cab + (s.resumo ?? g.resumo);
    if (aba === "tarefas") return cab + textoDasTarefas(g);
    if (aba === "ata") return cab + (s.ata ?? "");
    if (aba === "relatorio") return cab + (s.relatorio ?? "");
    if (aba === "mapa") return cab + [s.mapa?.central, ...(s.mapa?.nos ?? []).map((n) => `• ${n.rotulo} (${n.grupo})`)].filter(Boolean).join("\n");
    return cab + textoDaTranscricao(g.segmentos, g.transcricao);
  }

  async function compartilhar() {
    const texto = textoDaAba();
    try {
      await navigator.share({ title: g!.titulo, text: texto });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        await navigator.clipboard?.writeText(texto).catch(() => {});
        setAviso("Texto copiado.");
      }
    }
  }

  async function compartilharMapa() {
    const b = await grafo.current?.foto();
    if (!b) return;
    const arq = new File([b], `${g!.titulo} - mapa.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: g!.titulo });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = arq.name;
        a.click();
      }
    } catch {}
  }

  async function compartilharAudio() {
    if (!g?.audio) return;
    const ext = g.mime.includes("mp4") ? "m4a" : g.mime.includes("webm") ? "webm" : (g.audio as File).name?.split(".").pop() || "audio";
    const arq = new File([g.audio], `${g.titulo}.${ext}`, { type: g.mime || g.audio.type });
    try {
      if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: g.titulo });
      else setAviso("Este navegador não compartilha arquivos.");
    } catch {}
  }

  async function criarLink() {
    const sb = supabase();
    if (!sb || !acc.user || !g) return;
    try {
      const l = await criarLinkPublico(
        sb,
        acc.user.id,
        { titulo: g.titulo, criadoEm: g.criadoEm, duracao: g.duracao, saidas: { resumo: s.resumo ?? g.resumo, tarefas: s.tarefas, mapa: s.mapa, ata: s.ata, relatorio: s.relatorio } },
        dias,
      );
      const endereco = `${location.origin}/g/${l.id}`;
      setLink({ url: endereco, expira: new Date(l.expira_em).toLocaleDateString("pt-BR") });
      await navigator.clipboard?.writeText(endereco).catch(() => {});
    } catch (e) {
      setAviso(`Não consegui criar o link: ${(e as Error).message}`);
    }
  }

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
    await atualizar({ saidas: { ...s, resumo: texto, geradoPor: "Apple Intelligence", geradoEm: Date.now() } });
    setAguardandoAtalho(null);
  }

  async function enviarParaLembretes() {
    const lista = (s.tarefas ?? []).filter((t) => !t.feita).map((t) => `${t.texto}${t.prazo ? ` (${t.prazo})` : ""}`).join("\n");
    if (!lista) return setAviso("Não há tarefas pendentes.");
    await navigator.clipboard?.writeText(lista).catch(() => {});
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(lerAjustes().atalhoLembretes)}&input=clipboard`;
  }

  async function excluir() {
    if (!g || !confirm("Excluir esta gravação? Não dá para desfazer.")) return;
    await apagar(g.id);
    const sb = supabase();
    if (sb && acc.user) void sincronizarGravacoes(sb, acc.user.id).catch(() => {});
    router.replace("/gravar");
  }

  const botaoGerar = (tipo: TipoSaida, rotulo: string) =>
    temIA ? (
      <button type="button" className="btn btn-primary" disabled={!!gerando || !g.transcricao} onClick={() => void gerar(tipo)}>
        {gerando === tipo ? "Gerando…" : rotulo}
      </button>
    ) : (
      <Link href="/conectar-ia" className="btn btn-primary">
        Conectar minha IA
      </Link>
    );

  return (
    <div className="pt-6">
      <Link href="/gravar" className="btn btn-quiet -ml-4">
        ‹ Gravações
      </Link>
      <input
        className="mt-2 w-full bg-transparent font-serif text-3xl font-bold outline-none"
        aria-label="Título"
        defaultValue={g.titulo}
        key={g.id}
        onBlur={(e) => {
          const t = e.target.value.trim();
          if (t && t !== g.titulo) void atualizar({ titulo: t });
        }}
      />
      <p className="text-sm text-muted">
        {dataCurta(g.criadoEm)} · {hhmmss(g.duracao)}
        {s.geradoPor ? ` · IA: ${s.geradoPor}` : ""}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-muted">
          Persona
          <select
            className="field text-base text-ink"
            value={g.personaId ?? lerAjustes().personaId}
            onChange={(e) => {
              void atualizar({ personaId: e.target.value });
              salvarAjustes({ personaId: e.target.value });
            }}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Projeto
          <select
            className="field text-base text-ink"
            value={g.projetoId ?? ""}
            onChange={(e) => {
              void atualizar({ projetoId: e.target.value || undefined });
              salvarAjustes({ projetoId: e.target.value });
            }}
          >
            <option value="">Sem projeto</option>
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {url ? (
        <audio ref={player} src={url} controls preload="metadata" className="mt-4 w-full" />
      ) : (
        <p className="mt-4 text-sm text-muted">O áudio desta gravação está no aparelho em que ela foi feita. Aqui chegou só o texto.</p>
      )}

      {!g.transcricao && !progresso && g.audio && (
        <div className="mt-6 grid gap-2">
          <button type="button" className="btn btn-primary w-full" onClick={() => void transcrever("aparelho")}>
            Transcrever neste aparelho (grátis)
          </button>
          {aceitaAudio(ia.conn ?? null) ? (
            <button type="button" className="btn w-full" onClick={() => void transcrever("ia")}>
              Transcrever com {ia.nome} (separa quem fala)
            </button>
          ) : (
            ia.conn && <p className="text-sm text-muted">{ia.nome} não transcreve áudio. Para separar quem fala, conecte OpenAI, Gemini ou OpenRouter.</p>
          )}
        </div>
      )}
      {(progresso || gerando) && (
        <div className="mt-6 grid gap-2" role="status">
          <progress className="h-2 w-full accent-ink" value={progresso?.fracao ?? undefined} max={1} />
          <span className="text-sm text-muted">
            {progresso?.rotulo ?? `${persona?.nome ?? "A IA"} está preparando ${gerando === "essencial" ? "resumo, tarefas e mapa" : gerando === "ata" ? "a ata" : "o relatório"}…`}
          </span>
        </div>
      )}
      {aviso && (
        <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">
          {aviso}
        </p>
      )}

      {(g.transcricao || s.resumo) && (
        <>
          <nav aria-label="Conteúdos" className="-mx-4 mt-6 overflow-x-auto px-4">
            <ul className="flex w-max gap-1 border-b border-line">
              {ABAS.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-current={aba === a.id ? "page" : undefined}
                    onClick={() => setAba(a.id)}
                    className="min-h-11 whitespace-nowrap px-3 font-medium text-muted aria-[current=page]:border-b-4 aria-[current=page]:border-marker aria-[current=page]:text-ink"
                  >
                    {a.nome}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="mt-4" aria-live="polite">
            {aba === "resumo" && (
              <div className="grid gap-3">
                <div className="rounded-xl border border-line bg-surface px-4 py-3">
                  {s.resumo ? <Markdown texto={s.resumo} /> : g.resumo ? <Markdown texto={g.resumo} /> : <p className="text-muted">Ainda sem resumo.</p>}
                  {!s.resumo && g.resumo && <p className="mt-2 text-xs text-muted">Resumo rápido feito no aparelho, sem IA.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {botaoGerar("essencial", s.resumo ? "Refazer resumo, tarefas e mapa" : "Gerar resumo, tarefas e mapa")}
                  <button type="button" className="btn" onClick={() => void resumirComApple()} disabled={!g.transcricao}>
                    Apple Intelligence
                  </button>
                  {aguardandoAtalho && (
                    <button type="button" className="btn" onClick={() => void colarResumo()}>
                      Colar o resumo do Atalho
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted">
                  Modelo do Atalho:
                  <select className="field w-auto py-1" value={g.template} onChange={(e) => void atualizar({ template: e.target.value })}>
                    {Object.entries(MODELOS).map(([k, m]) => (
                      <option key={k} value={k}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {aba === "tarefas" && (
              <div className="grid gap-3">
                {s.tarefas?.length ? (
                  <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                    {s.tarefas.map((t, i) => (
                      <li key={i}>
                        <label className="flex min-h-11 items-start gap-3 px-4 py-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 shrink-0"
                            checked={!!t.feita}
                            onChange={(e) => {
                              const tarefas = s.tarefas!.map((x, j) => (j === i ? { ...x, feita: e.target.checked } : x));
                              void atualizar({ saidas: { ...s, tarefas } });
                            }}
                          />
                          <span className={t.feita ? "text-muted line-through" : ""}>
                            {t.texto}
                            {(t.responsavel || t.prazo) && (
                              <span className="block text-sm text-muted">{[t.responsavel, t.prazo && `prazo: ${t.prazo}`].filter(Boolean).join(" · ")}</span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">{s.resumo ? "A IA não encontrou tarefas nesta gravação." : "As tarefas saem junto com o resumo da IA."}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!s.tarefas && botaoGerar("essencial", "Gerar resumo, tarefas e mapa")}
                  {!!s.tarefas?.length && (
                    <button type="button" className="btn btn-primary" onClick={() => void enviarParaLembretes()}>
                      Enviar para Lembretes
                    </button>
                  )}
                </div>
              </div>
            )}

            {aba === "mapa" && (
              <div className="grid gap-3">
                {s.mapa ? (
                  <>
                    <Grafo3D ref={grafo} dados={grafoDaGravacao(s.mapa, g)} aoEscolher={setNoEscolhido} />
                    {noEscolhido ? (
                      <div className="rounded-xl border border-line bg-surface px-4 py-3">
                        <p className="font-semibold">{noEscolhido.rotulo}</p>
                        <p className="text-sm text-muted">Tema: {noEscolhido.grupo}</p>
                        {noEscolhido.trechos[0]?.trecho && <p className="mt-2 italic">“{noEscolhido.trechos[0].trecho}”</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Arraste para girar, use dois dedos para aproximar e toque numa ideia para acender as ligações.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary" onClick={() => void compartilharMapa()}>
                        Compartilhar imagem
                      </button>
                      <button type="button" className="btn" onClick={() => grafo.current?.centralizar()}>
                        Centralizar
                      </button>
                      <Link href="/gravar/grafo" className="btn">
                        Grafo Geral
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted">O mapa mental sai junto com o resumo da IA.</p>
                    <div>{botaoGerar("essencial", "Gerar resumo, tarefas e mapa")}</div>
                  </>
                )}
              </div>
            )}

            {(aba === "ata" || aba === "relatorio") && (
              <div className="grid gap-3">
                {s[aba] ? (
                  <div className="rounded-xl border border-line bg-surface px-4 py-3">
                    <Markdown texto={s[aba]!} />
                  </div>
                ) : (
                  <p className="text-muted">{aba === "ata" ? "A ata formal é gerada quando você pedir." : "O relatório analítico é gerado quando você pedir."}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {botaoGerar(aba, s[aba] ? "Refazer" : aba === "ata" ? "Gerar ata" : "Gerar relatório")}
                  {s[aba] && (
                    <Link href={`/gravar/${g.id}/imprimir?parte=${aba}`} className="btn">
                      PDF
                    </Link>
                  )}
                </div>
              </div>
            )}

            {aba === "transcricao" && (
              <div>
                <div className="flex justify-end">
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
                ) : (
                  <div className="reading-text text-lg leading-relaxed">
                    {segs.map((sg, i) => (
                      <p key={i} className="my-3">
                        <button
                          type="button"
                          className="mr-2 rounded border border-line px-1.5 align-[2px] font-sans text-xs font-semibold tabular-nums text-muted"
                          onClick={() => {
                            if (!player.current) return;
                            player.current.currentTime = sg.inicio;
                            void player.current.play();
                          }}
                          aria-label={`Ouvir a partir de ${hhmmss(sg.inicio)}`}
                        >
                          {hhmmss(sg.inicio)}
                        </button>
                        {"falante" in sg && sg.falante && <strong className="mr-1 font-sans text-base">{sg.falante}:</strong>}
                        {sg.texto}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="compartilhar" className="mt-10 border-t border-line pt-6">
        <h2 id="compartilhar" className="font-semibold">
          Compartilhar
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => void compartilhar()}>
            {ABAS.find((a) => a.id === aba)?.nome} (texto)
          </button>
          <Link href={`/gravar/${g.id}/imprimir`} className="btn">
            PDF completo
          </Link>
          {g.audio && (
            <button type="button" className="btn" onClick={() => void compartilharAudio()}>
              Áudio
            </button>
          )}
        </div>
        {acc.enabled && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-4">
            <p className="font-medium">Link público (só leitura, sem áudio)</p>
            {acc.user ? (
              link ? (
                <p className="mt-2 break-all text-sm">
                  Copiado: <a href={link.url} className="underline">{link.url}</a> · vale até {link.expira}. Revogue em Ajustes.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select className="field w-auto" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Validade">
                    <option value={1}>Vale 1 dia</option>
                    <option value={7}>Vale 7 dias</option>
                    <option value={30}>Vale 30 dias</option>
                  </select>
                  <button type="button" className="btn btn-primary" disabled={!s.resumo && !g.resumo} onClick={() => void criarLink()}>
                    Criar link
                  </button>
                </div>
              )
            ) : (
              <p className="mt-1 text-sm text-muted">
                <Link href="/entrar" className="underline">
                  Entre na sua conta
                </Link>{" "}
                para criar links.
              </p>
            )}
          </div>
        )}
        <button type="button" className="btn btn-quiet mt-6 text-danger" onClick={() => void excluir()}>
          Excluir gravação
        </button>
      </section>
    </div>
  );
}
