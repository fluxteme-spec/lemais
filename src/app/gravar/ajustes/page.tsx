"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/Account";
import { lerAjustes, PADRAO, salvarAjustes, type AjustesGravador } from "@/lib/gravador/ajustes";
import { enderecoEnvio, meusLinks, meuToken, revogarLink, trocarToken, type LinkPublico } from "@/lib/gravador/nuvem";
import { IDIOMAS, MODELOS_WHISPER } from "@/lib/gravador/transcrever";
import { aceitaAudio } from "@/lib/gravador/transcreverNuvem";
import { useIA } from "@/lib/gravador/useIA";
import { supabase } from "@/lib/supabase/browser";

function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-sm text-muted">{rotulo}</span>
      <div className="flex gap-2">
        <code className="field min-h-0 flex-1 overflow-x-auto whitespace-nowrap py-2 text-sm">{valor}</code>
        <button
          type="button"
          className="btn shrink-0"
          onClick={async () => {
            await navigator.clipboard?.writeText(valor).catch(() => {});
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          }}
        >
          {ok ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export default function AjustesGravadorPage() {
  const acc = useAccount();
  const ia = useIA();
  const [a, setA] = useState<AjustesGravador>(PADRAO);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [uso, setUso] = useState("");
  const [origem, setOrigem] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [links, setLinks] = useState<(LinkPublico & { titulo: string })[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setA(lerAjustes());
    setOrigem(window.location.origin);
    const g = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    (g ? g.requestAdapter().then(Boolean).catch(() => false) : Promise.resolve(false)).then(setGpu);
    navigator.storage?.estimate?.().then((e) => setUso(`${Math.round((e.usage ?? 0) / 1e6)} MB usados neste aparelho`));
  }, []);

  useEffect(() => {
    const sb = supabase();
    if (!sb || !acc.user || acc.needsOnboarding) return;
    meuToken(sb, acc.user.id)
      .then(setToken)
      .catch((e) => setErro(`Não consegui criar o seu código: ${(e as Error).message}`));
    meusLinks(sb, acc.user.id).then(setLinks).catch(() => {});
  }, [acc.user, acc.needsOnboarding]);

  const mudar = (m: Partial<AjustesGravador>) => setA(salvarAjustes(m));
  const envio = token ? enderecoEnvio(token) : null;

  return (
    <div className="pt-6">
      <Link href="/gravar" className="btn btn-quiet -ml-4">
        ‹ Gravações
      </Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Ajustes e Atalhos</h1>

      <section className="mt-8 grid gap-4" aria-labelledby="t">
        <h2 id="t" className="font-semibold">
          Transcrição
        </h2>
        <fieldset className="grid gap-2">
          <legend className="mb-1">Quem transcreve por padrão</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="motor" className="h-5 w-5" checked={a.motor === "aparelho"} onChange={() => mudar({ motor: "aparelho" })} />
            Este aparelho (grátis, funciona offline)
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="motor" className="h-5 w-5" checked={a.motor === "ia"} disabled={!aceitaAudio(ia.conn ?? null)} onChange={() => mudar({ motor: "ia" })} />
            {aceitaAudio(ia.conn ?? null) ? `Minha IA (${ia.nome}) — separa quem fala` : "Minha IA — conecte OpenAI, Gemini ou OpenRouter"}
          </label>
        </fieldset>
        <label className="grid gap-1">
          Modelo do aparelho
          <select className="field" value={a.modelo} onChange={(e) => mudar({ modelo: e.target.value })}>
            {MODELOS_WHISPER.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
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
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={a.autoIA} onChange={(e) => mudar({ autoIA: e.target.checked })} />
          Depois, gerar resumo, tarefas e mapa 3D com a minha IA
        </label>
        {gpu !== null && <p className="text-sm text-muted">{gpu ? "GPU disponível (WebGPU): transcrição no aparelho rápida." : "Sem WebGPU neste navegador: a transcrição no aparelho usa a CPU e fica mais lenta."}</p>}
      </section>

      <section className="mt-10" aria-labelledby="ia">
        <h2 id="ia" className="font-semibold">
          Minha IA
        </h2>
        <p className="mt-2">
          {ia.conn ? (
            <>
              Conectada: <strong>{ia.nome}</strong> ({ia.conn.model}).{" "}
            </>
          ) : (
            "Nenhuma IA conectada. "
          )}
          <Link href="/conectar-ia" className="underline underline-offset-4">
            {ia.conn ? "Trocar" : "Conectar minha IA"}
          </Link>
        </p>
        <p className="mt-1 text-sm text-muted">A chave fica só neste aparelho. O texto e o áudio vão direto do aparelho para a sua conta, sem passar pelo LêMais.</p>
      </section>

      <section className="mt-10" aria-labelledby="botao">
        <h2 id="botao" className="font-semibold">
          Botão de Ação: gravar com a tela bloqueada
        </h2>
        <p className="mt-2">O Atalho grava pelo gravador do iPhone (funciona no bolso) e, ao parar, envia o áudio para a sua caixa de entrada. Ao abrir o LêMais, ele aparece pronto para transcrever.</p>
        {!acc.enabled ? null : !acc.user ? (
          <p className="mt-3">
            <Link href="/entrar" className="btn btn-primary">
              Entrar para criar o seu código
            </Link>
          </p>
        ) : erro ? (
          <p className="mt-3 text-danger">{erro}</p>
        ) : !envio ? (
          <p className="mt-3 text-muted">Criando o seu código…</p>
        ) : (
          <div className="mt-4 grid gap-3">
            <Copiar rotulo="1. Endereço (URL)" valor={envio.url} />
            <Copiar rotulo={`2. Cabeçalho: chave "${envio.cabecalho}" com o valor`} valor={envio.valor} />
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>
                No app <b>Atalhos</b>, toque em <b>+</b> e dê o nome <b>Gravar e enviar ao LêMais</b>.
              </li>
              <li>
                Adicione <b>Gravar Áudio</b>. Em “Iniciar gravação”, escolha <b>Imediatamente</b> e em “Terminar” escolha <b>Ao Tocar</b>.
              </li>
              <li>
                Adicione <b>Obter Conteúdo de URL</b>. Em URL, cole o endereço do item 1 e, logo depois dele, insira a variável <b>Data Atual</b> (formato personalizado <code>yyyyMMdd-HHmmss</code>) seguida de <code>.m4a</code>.
              </li>
              <li>
                Toque em <b>Mostrar Mais</b>: Método <b>POST</b>; em Cabeçalhos, adicione <code>{envio.cabecalho}</code> com o valor do item 2 e <code>Content-Type</code> com <code>audio/mp4</code>; em Corpo da Requisição, escolha <b>Arquivo</b> e selecione <b>Áudio Gravado</b>.
              </li>
              <li>
                Em <b>Ajustes do iPhone › Botão de Ação</b>, escolha <b>Atalho › Gravar e enviar ao LêMais</b>.
              </li>
            </ol>
            <p className="text-sm text-muted">O código só permite enviar áudios para a sua caixa; ninguém consegue ler com ele. O áudio é apagado da nuvem assim que o app o importa.</p>
            <button
              type="button"
              className="btn btn-quiet justify-self-start"
              onClick={async () => {
                const sb = supabase();
                if (!sb || !acc.user || !confirm("Trocar o código? O Atalho antigo para de funcionar e você precisará colar o endereço novo.")) return;
                setToken(await trocarToken(sb, acc.user.id));
              }}
            >
              Trocar o código
            </button>
          </div>
        )}
        <h3 className="mt-6 font-semibold">Atalho rápido (abre o app já gravando)</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Novo atalho <b>Gravar no LêMais</b> com a ação <b>Abrir URLs</b>: <code className="break-all">{origem || "https://…"}/gravar/gravando</code>
          </li>
          <li>Use pela Siri (“E aí Siri, Gravar no LêMais”) ou num widget. Esse para de gravar se a tela bloquear.</li>
        </ol>
      </section>

      <section className="mt-10 grid gap-3" aria-labelledby="ap">
        <h2 id="ap" className="font-semibold">
          Resumo com Apple Intelligence (no aparelho)
        </h2>
        <label className="grid gap-1">
          Nome do atalho
          <input className="field" value={a.atalho} onChange={(e) => mudar({ atalho: e.target.value || PADRAO.atalho })} />
        </label>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Novo atalho <b>{a.atalho}</b>: <b>Obter Área de Transferência</b> → <b>Usar Modelo</b> (No Dispositivo; pedido = Área de Transferência) → <b>Copiar para Área de Transferência</b> (Resposta).
          </li>
          <li>Na gravação, toque em Apple Intelligence; quando terminar, volte e toque em Colar.</li>
        </ol>
      </section>

      <section className="mt-10 grid gap-3" aria-labelledby="lem">
        <h2 id="lem" className="font-semibold">
          Tarefas para o app Lembretes
        </h2>
        <label className="grid gap-1">
          Nome do atalho
          <input className="field" value={a.atalhoLembretes} onChange={(e) => mudar({ atalhoLembretes: e.target.value || PADRAO.atalhoLembretes })} />
        </label>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Novo atalho <b>{a.atalhoLembretes}</b>: <b>Obter Área de Transferência</b> → <b>Dividir Texto</b> (Novas Linhas) → <b>Repetir com Cada</b> → dentro: <b>Adicionar Novo Lembrete</b> (Item Repetido).
          </li>
          <li>Na aba Tarefas de uma gravação, toque em Enviar para Lembretes.</li>
        </ol>
      </section>

      {acc.user && (
        <section className="mt-10" aria-labelledby="lk">
          <h2 id="lk" className="font-semibold">
            Meus links públicos
          </h2>
          {links.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum link criado.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {links.map((l) => {
                const ativo = !l.revogado && new Date(l.expira_em) > new Date();
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate">{l.titulo}</span>
                      <span className="text-sm text-muted">{ativo ? `vale até ${new Date(l.expira_em).toLocaleDateString("pt-BR")}` : l.revogado ? "revogado" : "expirado"}</span>
                    </span>
                    {ativo && (
                      <button
                        type="button"
                        className="btn btn-quiet shrink-0 text-danger"
                        onClick={async () => {
                          const sb = supabase();
                          if (!sb) return;
                          await revogarLink(sb, l.id);
                          setLinks((xs) => xs.map((x) => (x.id === l.id ? { ...x, revogado: true } : x)));
                        }}
                      >
                        Revogar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="mt-10" aria-labelledby="arm">
        <h2 id="arm" className="font-semibold">
          Armazenamento
        </h2>
        <p className="mt-2 text-sm text-muted">{uso}</p>
        <p className="mt-1 text-sm text-muted">O áudio fica só neste aparelho. Com a conta, o texto (transcrição e saídas) sincroniza entre os seus aparelhos.</p>
      </section>
    </div>
  );
}
