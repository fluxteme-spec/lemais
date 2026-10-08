/** Dados do responsável exibidos nos documentos legais (configure nas variáveis de ambiente). */
export const LEGAL = {
  responsavel: process.env.NEXT_PUBLIC_RESPONSAVEL || "o responsável pelo LêMais",
  contato: process.env.NEXT_PUBLIC_CONTATO || "",
  atualizadoEm: "8 de outubro de 2026",
};

/** Link de doação (Mercado Pago). Pode ser trocado pela variável NEXT_PUBLIC_DOACAO_URL. */
export const DOACAO_URL = process.env.NEXT_PUBLIC_DOACAO_URL || "https://link.mercadopago.com.br/lemais";
