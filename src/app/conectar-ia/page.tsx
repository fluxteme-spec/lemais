"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getConnection, removeConnection, saveConnection } from "@/lib/ai/connection";
import { buildAuthUrl } from "@/lib/ai/oauth";
import { listModels, PROVIDERS, suggestModel, type AIConnection, type AIProviderId, type ModelOption } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/comprehension/provider";

const KEY_PROVIDERS: AIProviderId[] = ["gemini", "openai", "anthropic", "openrouter"];
const RETURN_KEY = "lemais-voltar";

function safeReturn(v: string | null): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function ConnectAIPage() {
  const [conn, setConn] = useState<AIConnection | null | undefined>(undefined);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [filter, setFilter] = useState("");
  const [provider, setProvider] = useState<AIProviderId>("gemini");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | "login" | "key" | "test">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = safeReturn(params.get("voltar"));
    if (fromUrl) session()?.setItem(RETURN_KEY, fromUrl);
    setBack(fromUrl ?? safeReturn(session()?.getItem(RETURN_KEY) ?? null));
    if (params.get("ok")) setNotice("Conta conectada.");
    getConnection().then((c) => {
      setConn(c);
      if (c) void refreshModels(c, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshModels(c: AIConnection, announce: boolean) {
    setBusy("test");
    setError(null);
    try {
      const list = await listModels(c.provider, c.apiKey);
      setModels(list);
      if (announce) setNotice(`Conexão funcionando. ${list.length} modelos disponíveis.`);
    } catch (e) {
      setError(e instanceof ProviderError ? e.message : "Não foi possível testar a conexão.");
    } finally {
      setBusy(null);
    }
  }

  async function loginOpenRouter() {
    setBusy("login");
    setError(null);
    const store = session();
    if (!store) {
      setBusy(null);
      return setError("Este navegador bloqueou o armazenamento temporário necessário para o login. Use a opção de chave abaixo.");
    }
    window.location.href = await buildAuthUrl(window.location.origin, store);
  }

  async function connectWithKey(e: React.FormEvent) {
    e.preventDefault();
    const k = key.trim();
    if (!k) return;
    setBusy("key");
    setError(null);
    try {
      const list = await listModels(provider, k);
      const model = suggestModel(provider, list);
      if (!model) throw new ProviderError("upstream", "A conta não tem modelos de texto disponíveis.");
      const c: AIConnection = { provider, apiKey: k, model, connectedAt: new Date().toISOString() };
      await saveConnection(c);
      setConn(c);
      setModels(list);
      setKey("");
      setNotice(`Conectado a ${PROVIDERS[provider].name}.`);
    } catch (err) {
      setError(err instanceof ProviderError ? err.message : "Não foi possível conectar. Confira a chave.");
    } finally {
      setBusy(null);
    }
  }

  async function changeModel(model: string) {
    if (!conn) return;
    const c = { ...conn, model };
    await saveConnection(c);
    setConn(c);
    setNotice(`Modelo alterado para ${model}.`);
  }

  async function disconnect() {
    await removeConnection();
    setConn(null);
    setModels([]);
    setNotice("Conta desconectada. A chave foi apagada deste navegador.");
  }

  const shownModels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)) : models;
    // garante que o modelo atual apareça mesmo filtrado
    if (conn && !list.some((m) => m.id === conn.model)) return [{ id: conn.model, label: conn.model }, ...list.slice(0, 199)];
    return list.slice(0, 200);
  }, [models, filter, conn]);

  if (conn === undefined) return <p className="pt-12 text-muted">Carregando…</p>;

  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">Conecte a sua IA</h1>
      <p className="mt-3 max-w-prose">
        As perguntas sobre textos colados ou importados são criadas pela sua própria conta de IA. Você escolhe o provedor e paga só o que usar,
        direto para ele.
      </p>

      {notice && (
        <p role="status" className="mt-4 border-l-4 border-ok pl-3">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 border-l-4 border-danger pl-3">
          {error}
        </p>
      )}

      {conn ? (
        <section aria-labelledby="conectado" className="mt-8">
          <h2 id="conectado" className="font-serif text-2xl font-bold">
            Conectado a {PROVIDERS[conn.provider].name}
          </h2>
          <p className="mt-1 text-sm text-muted">Desde {new Date(conn.connectedAt).toLocaleDateString("pt-BR", { dateStyle: "long" })}.</p>

          <div className="mt-6">
            <label htmlFor="modelo" className="mb-1 block font-medium">
              Modelo usado nas perguntas
            </label>
            {models.length > 30 && (
              <input className="field mb-2" placeholder="Filtrar modelos (ex.: gemini, gpt, claude)" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar modelos" />
            )}
            <select id="modelo" className="field" value={conn.model} onChange={(e) => void changeModel(e.target.value)}>
              {shownModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label === m.id ? m.id : `${m.label} (${m.id})`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-muted">Já deixamos sugerido um modelo rápido e econômico. Modelos maiores costumam custar mais por pergunta.</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {back && (
              <Link href={back} className="btn btn-primary">
                Voltar ao teste
              </Link>
            )}
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void refreshModels(conn, true)}>
              {busy === "test" ? "Testando…" : "Testar conexão"}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void disconnect()}>
              Desconectar
            </button>
          </div>
          {conn.provider === "openrouter" && (
            <p className="mt-3 text-sm text-muted">
              Você pode ver o consumo ou revogar o acesso do LêMais a qualquer momento em{" "}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                openrouter.ai
              </a>
              .
            </p>
          )}
        </section>
      ) : (
        <>
          <section aria-labelledby="login" className="mt-8 border-l-4 border-marker pl-4">
            <h2 id="login" className="font-serif text-2xl font-bold">
              Entrar com uma conta
            </h2>
            <p className="mt-2 max-w-prose">
              Com um login no OpenRouter você usa modelos do Google (Gemini), da OpenAI (ChatGPT), da Anthropic (Claude) e de outros, e troca de
              modelo quando quiser. Dá para entrar com a sua conta Google. O uso é pago com créditos da sua conta no OpenRouter.
            </p>
            <button type="button" className="btn btn-primary mt-4 h-14 px-8 text-lg" disabled={busy !== null} onClick={() => void loginOpenRouter()}>
              {busy === "login" ? "Abrindo…" : "Entrar com OpenRouter"}
            </button>
          </section>

          <section aria-labelledby="chave" className="mt-12">
            <h2 id="chave" className="font-semibold">
              Ou conecte direto um provedor
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">Crie uma chave no site do provedor e cole aqui. Leva cerca de um minuto.</p>
            <form onSubmit={connectWithKey} className="mt-4 space-y-4">
              <fieldset>
                <legend className="sr-only">Provedor</legend>
                <div className="flex flex-wrap gap-2">
                  {KEY_PROVIDERS.map((p) => (
                    <label
                      key={p}
                      className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-4 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus"
                    >
                      <input type="radio" name="provedor" className="sr-only" checked={provider === p} onChange={() => setProvider(p)} />
                      {PROVIDERS[p].name}
                    </label>
                  ))}
                </div>
              </fieldset>
              {PROVIDERS[provider].keyUrl && (
                <p>
                  <a href={PROVIDERS[provider].keyUrl!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    Criar uma chave em {PROVIDERS[provider].name}
                  </a>
                  {provider === "gemini" && <span className="text-muted"> — o Google costuma oferecer uma cota gratuita para começar.</span>}
                </p>
              )}
              <div>
                <label htmlFor="chave-api" className="mb-1 block font-medium">
                  Chave de {PROVIDERS[provider].name}
                </label>
                <input
                  id="chave-api"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="field font-mono"
                  placeholder={PROVIDERS[provider].keyHint}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                {key.trim() && !PROVIDERS[provider].keyPattern.test(key.trim()) && (
                  <p className="mt-1 text-sm text-muted">Essa chave não parece ser de {PROVIDERS[provider].name}. Confira o provedor selecionado.</p>
                )}
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy !== null || !key.trim()}>
                {busy === "key" ? "Conectando…" : "Conectar"}
              </button>
            </form>
          </section>

          <p className="mt-10 max-w-prose text-sm text-muted">
            Assinaturas como ChatGPT Plus, Claude Pro ou Gemini Advanced não podem ser usadas por outros aplicativos; o uso pela API é cobrado à
            parte pelo provedor.
          </p>
        </>
      )}

      <p className="mt-6 max-w-prose text-sm text-muted">
        A chave fica guardada só neste navegador. O texto vai direto do seu navegador para o provedor escolhido, sem passar pelo servidor do LêMais.
        Para apagar a chave, use Desconectar ou apague os dados em Configurações.
      </p>
    </div>
  );
}
