// Modelos de resumo enviados ao Apple Intelligence pelo Atalho.
export const MODELOS: Record<string, { nome: string; instrucao: string }> = {
  reuniao: {
    nome: 'Reunião',
    instrucao:
      'Resuma a reunião abaixo em português do Brasil. Use exatamente estas seções: ' +
      '"Assunto" (1 frase), "Principais pontos" (tópicos curtos), "Decisões", ' +
      '"Pendências" (cada uma com responsável e prazo quando citados) e "Próximos passos". ' +
      'Não invente nada que não esteja na transcrição.',
  },
  visita: {
    nome: 'Visita a cliente',
    instrucao:
      'Resuma esta visita a cliente em português do Brasil, com as seções: "Cliente e contexto", ' +
      '"Equipamentos citados" (modelo, local, problema), "Reclamações e pedidos do cliente", ' +
      '"Oportunidades comerciais", "O que foi combinado" e "Pendências" (com responsável e prazo). ' +
      'Seja objetivo e não invente informações.',
  },
  ligacao: {
    nome: 'Ligação',
    instrucao:
      'Resuma esta ligação em português do Brasil em até 8 tópicos: quem falou, o motivo, ' +
      'valores, datas e prazos citados, o que foi combinado e o que ficou pendente. Não invente nada.',
  },
  ideia: {
    nome: 'Ideia / nota pessoal',
    instrucao:
      'Organize esta nota falada em português do Brasil: um título curto, a ideia central em 2 frases, ' +
      'os pontos em tópicos e uma lista de próximas ações. Corrija repetições e vícios de fala.',
  },
  aula: {
    nome: 'Aula / curso',
    instrucao:
      'Transforme esta aula em notas de estudo em português do Brasil: tema, conceitos principais com ' +
      'explicação curta, exemplos citados, vocabulário novo (se for aula de idioma, com a tradução) ' +
      'e 3 perguntas de revisão.',
  },
};

export function montarPrompt(chave: string, transcricao: string): string {
  const m = MODELOS[chave] || MODELOS.reuniao;
  return `${m.instrucao}\n\nTRANSCRIÇÃO:\n${transcricao}`;
}
