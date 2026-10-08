import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <article className="reading-text max-w-prose pt-10 text-[1.05rem] leading-relaxed [&_h2]:mt-8 [&_h2]:font-sans [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="font-serif text-4xl font-bold">Política de privacidade</h1>
      <p className="font-sans text-sm text-muted">Atualizada em {LEGAL.atualizadoEm}.</p>

      <p>
        Esta política explica quais dados o LêMais usa, por que e como você pode controlá-los, conforme a Lei Geral de Proteção de Dados (LGPD). O controlador
        dos dados é {LEGAL.responsavel}.
      </p>

      <h2>Sem conta</h2>
      <p>Você pode ler sem criar conta. Nesse caso, textos, leituras e preferências ficam apenas no seu navegador e não são enviados ao LêMais.</p>

      <h2>Com conta</h2>
      <ul>
        <li>Dados de cadastro: e-mail, nome de exibição e, no login com Google, o nome fornecido pelo Google.</li>
        <li>Confirmação de idade mínima (13 anos) e aceite destes termos, com data.</li>
        <li>Suas leituras: textos que você salvou, sessões, ritmo, questionários e preferências, para sincronizar entre aparelhos.</li>
        <li>Datas de acesso, para medir o uso do app de forma agregada.</li>
        <li>Quem convidou você, quando você entra por um link de convite.</li>
      </ul>
      <p>Base legal: execução do serviço que você solicitou (art. 7º, V) e legítimo interesse para estatísticas agregadas e segurança (art. 7º, IX).</p>

      <h2>Compartilhamentos</h2>
      <p>
        Ao compartilhar um resultado, criamos uma página pública com o que você escolheu mostrar: seu nome de exibição, título e fonte do texto, um trecho curto
        opcional e o desempenho. Qualquer pessoa com o link pode vê-la. Você pode excluir a conta para apagá-la.
      </p>

      <h2>Inteligência artificial</h2>
      <p>
        Perguntas e adaptações de texto usam a IA que você conectar (por exemplo, Google Gemini, OpenAI, Anthropic ou OpenRouter). A chave fica só no seu
        navegador, e o texto vai direto do seu navegador para esse provedor, que o trata conforme a política dele. O LêMais não recebe essa chave.
      </p>

      <h2>Importação de links</h2>
      <p>
        Ao importar um link, nosso servidor baixa a página apenas para extrair o texto e não a guarda. Registramos somente o domínio e o resultado da tentativa,
        para segurança.
      </p>

      <h2>Propagandas</h2>
      <p>
        As propagandas exibidas são escolhidas pelo LêMais, sem uso de perfil pessoal. Contamos apenas quantas vezes cada uma foi exibida e clicada, sem
        identificar quem clicou.
      </p>

      <h2>Doações</h2>
      <p>
        As doações são feitas no Mercado Pago, em página própria dele, com a política de privacidade dele. O LêMais não recebe dados de cartão ou de conta. Se
        você usar o botão “Já doei”, guardamos apenas a data desse pedido para o responsável conferir a doação e conceder a medalha de apoiador.
      </p>

      <h2>Operadores</h2>
      <p>
        Usamos provedores de infraestrutura para hospedar o app e o banco de dados (Vercel e Supabase), que podem armazenar dados fora do Brasil com garantias
        contratuais adequadas.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode acessar e corrigir seus dados na página Minha conta, excluir a conta e todos os dados a qualquer momento, e pedir informações sobre o
        tratamento{LEGAL.contato ? <> pelo e-mail {LEGAL.contato}</> : null}.
      </p>

      <h2>Retenção</h2>
      <p>
        Mantemos os dados enquanto a conta existir. Ao excluir a conta, os dados são apagados do banco de dados; cópias de segurança dos provedores são
        descartadas nos prazos deles.
      </p>
    </article>
  );
}
