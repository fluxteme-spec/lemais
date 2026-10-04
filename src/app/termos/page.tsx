import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <article className="reading-text max-w-prose pt-10 text-[1.05rem] leading-relaxed [&_h2]:mt-8 [&_h2]:font-sans [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="font-serif text-4xl font-bold">Termos de uso</h1>
      <p className="font-sans text-sm text-muted">Atualizados em {LEGAL.atualizadoEm}.</p>

      <p>O LêMais é um aplicativo gratuito de leitura guiada, oferecido por {LEGAL.responsavel}. Ao criar uma conta, você concorda com estes termos.</p>

      <h2>Quem pode usar</h2>
      <p>É preciso ter 13 anos ou mais para criar uma conta. Menores de 18 anos devem usar o app com conhecimento dos responsáveis.</p>

      <h2>O que o app faz e o que não promete</h2>
      <p>O LêMais ajuda a experimentar modos e ritmos de leitura e mostra métricas sobre as suas sessões. Ele não garante aumento de velocidade, compreensão ou memória, e as métricas não comprovam que um texto foi lido ou entendido. Versões adaptadas e perguntas criadas por IA podem conter erros.</p>

      <h2>Seu conteúdo</h2>
      <ul>
        <li>Você é responsável pelos textos que cola ou importa e deve ter o direito de usá-los.</li>
        <li>Respeite os direitos autorais: não compartilhe textos integrais de terceiros sem autorização. Os cartões de compartilhamento mostram apenas título, fonte e um trecho curto.</li>
        <li>Não use o app para conteúdo ilegal, ofensivo ou que viole direitos de outras pessoas.</li>
      </ul>

      <h2>Inteligência artificial</h2>
      <p>Os recursos de IA usam a conta que você conectar. Os custos e as regras desse provedor são combinados entre você e ele.</p>

      <h2>Propagandas</h2>
      <p>O app é gratuito e pode exibir propagandas identificadas como “Patrocinado”, nunca durante a leitura ou o questionário.</p>

      <h2>Suspensão</h2>
      <p>Contas que violem estes termos podem ser suspensas ou excluídas.</p>

      <h2>Alterações</h2>
      <p>Podemos atualizar estes termos. Mudanças relevantes serão avisadas no app.</p>
      {LEGAL.contato && <p>Contato: {LEGAL.contato}.</p>}
    </article>
  );
}
