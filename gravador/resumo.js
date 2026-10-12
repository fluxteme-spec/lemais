// Resumo local e instantâneo, sem IA: escolhe as frases mais representativas
// da transcrição, encontra pendências e as palavras-chave. Roda offline.

const STOP = new Set(`a o as os um uma uns umas de da do das dos dum duma em na no nas nos num numa
por pelo pela pelos pelas para pra pro com sem sob sobre entre até após ante e ou mas nem que se
porque pois como quando onde quem qual quais cujo cuja este esta estes estas esse essa esses essas
aquele aquela aqueles aquelas isto isso aquilo eu tu ele ela nós vós eles elas me te se lhe nos vos
lhes meu minha meus minhas teu tua seu sua seus suas nosso nossa nossos nossas dele dela deles delas
você vocês ser é são era eram foi foram sou somos está estão estava estavam estar ter tem têm tinha
tinham ter há havia vai vão ia iam já não sim mais menos muito muita muitos muitas pouco também só
então aí ali aqui lá bem tá né tipo assim coisa coisas gente ok aham uhum hum ah eh oh daí agora
ainda depois antes sempre nunca todo toda todos todas cada outro outra outros outras mesmo mesma
fazer faz fez feito pode podem poder vou vamos ia acho sei sabe olha cara the and`.split(/\s+/));

const ACAO = /\b(precis\w*|tem que|temos que|tenho que|ficou de|fica de|(vou|vamos|vai) (enviar|mandar|ligar|fazer|agendar|marcar|trocar|verificar|resolver|passar|levar|comprar|preparar|instalar|retirar|entregar|cobrar|revisar|montar)|prazo|até (amanhã|segunda|terça|quarta|quinta|sexta|sábado|domingo|o fim|dia \d+)|combinad\w*|agend\w*|envi\w*|mand\w+|lig\w+ para|verific\w*|providenci\w*|resolv\w*|confirm\w*|pendente|pendência|follow.?up|próximo passo)\b/i;

const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function frases(texto) {
  return (texto || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý0-9"“])/u)
    .map((f) => f.trim())
    .filter((f) => f.split(' ').length >= 4);
}

function palavras(f) {
  return (f.match(/[\p{L}\d]+/gu) || []).map(norm).filter((w) => w.length > 2 && !STOP.has(w));
}

export function resumir(texto, { maxFrases } = {}) {
  const fs = frases(texto);
  if (!fs.length) return { destaques: [], acoes: [], palavras: [] };

  const freq = new Map();
  for (const f of fs) for (const w of palavras(f)) freq.set(w, (freq.get(w) || 0) + 1);
  const topo = Math.max(...freq.values(), 1);

  const notas = fs.map((f, i) => {
    const ws = palavras(f);
    if (!ws.length) return 0;
    const soma = ws.reduce((s, w) => s + freq.get(w) / topo, 0);
    const posicao = i < 2 ? 0.15 : 0; // o começo costuma dizer do que se trata
    return soma / Math.sqrt(ws.length) + posicao;
  });

  const n = maxFrases ?? Math.min(7, Math.max(2, Math.round(fs.length * 0.2)));
  const escolhidas = notas
    .map((nota, i) => ({ nota, i }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => fs[i]);

  const acoes = [...new Set(fs.filter((f) => ACAO.test(f)))].slice(0, 10);

  const chaves = [...freq.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  return { destaques: escolhidas, acoes, palavras: chaves };
}

export function resumoEmTexto(texto) {
  const r = resumir(texto);
  if (!r.destaques.length) return 'Transcrição curta demais para resumir.';
  let out = '## Destaques\n' + r.destaques.map((f) => `- ${f}`).join('\n');
  if (r.acoes.length) out += '\n\n## Pendências e combinados\n' + r.acoes.map((f) => `- [ ] ${f}`).join('\n');
  if (r.palavras.length) out += '\n\n## Palavras-chave\n' + r.palavras.join(', ');
  return out;
}
