import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre — leia mais, entenda melhor",
  description: "LêMais guia sua leitura no seu ritmo, mede quanto você entendeu e mostra sua evolução. Gratuito, sem fins lucrativos, funciona no celular.",
  openGraph: {
    title: "LêMais — ler mais rápido só importa se você continuar entendendo",
    description: "Leitura guiada, teste de compreensão e progresso honesto. Grátis.",
  },
};

const BLEED = "relative left-1/2 -ml-[50vw] w-screen";
const mark = "bg-marker text-marker-ink px-1.5 [box-decoration-break:clone]";

const STEPS = [
  ["Traga o texto", "Cole, abra um link, fotografe até 3 páginas ou anexe PDF e Word. Livros grandes são lidos 3 páginas por vez."],
  ["Leia no seu ritmo", "Palavra a palavra, em blocos ou com guia na linha. Você ajusta a velocidade e pausa quando quiser."],
  ["Confira o que ficou", "Um teste rápido de 3 perguntas mostra se o ritmo ajudou ou atrapalhou o entendimento."],
];

const FEATURES: { title: string; text: string; icon: React.ReactNode }[] = [
  {
    title: "Seu progresso, honesto",
    text: "Ritmo e entendimento lado a lado. Se o ritmo sobe e o entendimento cai, o app avisa.",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </>
    ),
  },
  {
    title: "Do papel para a tela",
    text: "Fotografe a página do livro ou da apostila. O texto é reconhecido no próprio celular.",
    icon: (
      <>
        <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  {
    title: "Seus textos ficam com você",
    text: "Arquivos são lidos no aparelho. Com conta, suas leituras sincronizam entre seus dispositivos.",
    icon: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    title: "Compartilhe e convide",
    text: "Mostre o que você leu e quanto entendeu. Ler junto dá mais vontade de continuar.",
    icon: (
      <>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v13" />
      </>
    ),
  },
];

const HABITS = [
  ["Comece pequeno.", "Dez minutos por dia vencem uma maratona no fim de semana."],
  ["Leia com um porquê.", "Antes de começar, pergunte o que você quer tirar do texto."],
  ["Explique para alguém.", "Contar o que leu é o melhor teste de entendimento."],
  ["Tire a distração do caminho.", "Notificações em silêncio por um trecho já mudam tudo."],
  ["Acelere só o que já entende.", "Texto difícil pede calma; texto fácil aguenta mais ritmo."],
];

export default function SobrePage() {
  return (
    <div className="text-lg">
      <section className="pt-10 pb-16 sm:pt-16">
        <p className="text-sm font-bold uppercase tracking-[0.15em] text-muted">Gratuito · sem fins lucrativos · funciona no celular</p>
        <h1 className="mt-4 font-serif text-4xl font-bold leading-[1.08] sm:text-6xl">
          Ler mais rápido só importa se você <span className={mark}>continuar entendendo.</span>
        </h1>
        <p className="mt-6 max-w-prose text-xl">
          O LêMais guia sua leitura no seu ritmo, mede quanto você entendeu e mostra sua evolução. Cole um texto, abra um link, escaneie uma página ou anexe um
          PDF.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary h-14 px-7 text-lg">
            Começar a ler agora
          </Link>
          <a href="#como" className="btn h-14 px-7 text-lg">
            Ver como funciona
          </a>
        </div>
        <p className="mt-3 text-sm text-muted">Sem cadastro para começar. Instale como app pelo navegador.</p>
      </section>

      <section id="como" aria-labelledby="como-titulo" className={`${BLEED} bg-ink text-paper`}>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 id="como-titulo" className="font-serif text-3xl font-bold sm:text-4xl">
            Três passos. Nenhuma pressa.
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <span aria-hidden className="font-serif text-5xl font-bold leading-none text-marker">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-xl font-bold">{t}</h3>
                <p className="mt-1 opacity-85">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="hab-titulo" className="py-16">
        <h2 id="hab-titulo" className="max-w-[20ch] font-serif text-3xl font-bold sm:text-4xl">
          Feito para criar o hábito, não para competir.
        </h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border-[1.5px] border-line bg-surface p-6">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {f.icon}
              </svg>
              <h3 className="mt-3 text-xl font-bold">{f.title}</h3>
              <p className="mt-1 text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="dicas" aria-labelledby="dicas-titulo" className={`${BLEED} border-y-[1.5px] border-line bg-surface`}>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 id="dicas-titulo" className="font-serif text-3xl font-bold sm:text-4xl">
            Cinco hábitos de quem lê mais.
          </h2>
          <p className="mt-3 text-muted">Pequenas escolhas que fazem a leitura caber no dia — com ou sem app.</p>
          <ol className="mt-8 space-y-5">
            {HABITS.map(([t, d], i) => (
              <li key={t} className="flex items-baseline gap-5">
                <span aria-hidden className="min-w-8 font-serif text-3xl font-bold">
                  {i + 1}
                </span>
                <span>
                  <strong>{t}</strong> {d}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-20 text-center">
        <h2 className="mx-auto max-w-[18ch] font-serif text-4xl font-bold leading-tight sm:text-5xl">
          Qual vai ser a sua <span className={mark}>próxima leitura?</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[46ch] text-xl">
          Abra o LêMais no celular ou no computador e comece com um texto de treino, um artigo ou aquele livro parado na estante.
        </p>
        <Link href="/" className="btn btn-primary mt-8 h-14 px-8 text-lg">
          Abrir o LêMais — é grátis
        </Link>
        <p className="mt-6 text-sm text-muted">
          Gratuito e sem fins lucrativos, mantido por doações.{" "}
          <Link href="/apoie" className="underline underline-offset-4">
            Apoie o projeto
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
