import { resumoEmTexto } from './resumo.js';
import { MODELOS, montarPrompt } from './modelos.js';

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hhmmss = (seg) => {
  seg = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
const dataCurta = (t) =>
  new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function aviso(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.hidden = true), ms);
}

// ---------- ajustes (por aparelho) ----------
const PADRAO = { modelo: 'onnx-community/whisper-small', idioma: 'portuguese', atalho: 'Resumir Gravador', template: 'reuniao' };
function ajustes() {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem('gravador:ajustes') || '{}') };
  } catch {
    return { ...PADRAO };
  }
}
function salvarAjustes(a) {
  try {
    localStorage.setItem('gravador:ajustes', JSON.stringify(a));
  } catch {}
}

// ---------- banco local (IndexedDB) ----------
const db = new Promise((ok, erro) => {
  const r = indexedDB.open('gravador', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('gravacoes', { keyPath: 'id' });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => erro(r.error);
});
async function loja(modo, fn) {
  const d = await db;
  return new Promise((ok, erro) => {
    const tx = d.transaction('gravacoes', modo);
    const req = fn(tx.objectStore('gravacoes'));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => erro(tx.error);
  });
}
const pegar = (id) => loja('readonly', (s) => s.get(id));
const todas = () => loja('readonly', (s) => s.getAll());
const guardar = (g) => loja('readwrite', (s) => s.put(g));
const apagar = (id) => loja('readwrite', (s) => s.delete(id));

// ---------- navegação ----------
const telas = ['lista', 'gravar', 'detalhe', 'ajustes'];
function mostrar(nome) {
  for (const t of telas) $('#v-' + t).hidden = t !== nome;
  window.scrollTo(0, 0);
}
async function rota() {
  const [nome, id] = location.hash.slice(1).split('/');
  if (nome === 'g' && id) return abrirDetalhe(id);
  if (nome === 'ajustes') return abrirAjustes();
  if (gravando()) return mostrar('gravar');
  mostrar('lista');
  renderLista();
}
addEventListener('hashchange', rota);

// ---------- lista ----------
async function renderLista() {
  const filtro = $('#busca').value.trim().toLowerCase();
  const gs = (await todas())
    .filter((g) => g.id !== 'rascunho')
    .filter((g) => !filtro || (g.titulo + ' ' + (g.transcricao || '')).toLowerCase().includes(filtro))
    .sort((a, b) => b.criadoEm - a.criadoEm);
  $('#lista').innerHTML = gs.length
    ? gs
        .map(
          (g) => `<li><a href="#g/${g.id}">
        <strong>${esc(g.titulo)}</strong>
        <span class="meta">${dataCurta(g.criadoEm)} · ${hhmmss(g.duracao)}
        ${g.resumo ? '· <b class="tag ok">resumo</b>' : g.transcricao ? '· <b class="tag">transcrita</b>' : ''}</span>
        ${g.transcricao ? `<span class="previa">${esc(g.transcricao.slice(0, 120))}</span>` : ''}
      </a></li>`
        )
        .join('')
    : `<li class="vazio">${filtro ? 'Nada encontrado.' : 'Nenhuma gravação ainda. Toque no botão vermelho para começar.'}</li>`;
}
$('#busca').addEventListener('input', renderLista);

// ---------- gravação ----------
let rec = null;
let stream = null;
let pedacos = [];
let inicioTrecho = 0;
let acumulado = 0;
let relogio = null;
let salvaRascunho = null;
let trava = null;
let medidor = null;
const gravando = () => rec && rec.state !== 'inactive';
const tempoGravado = () => acumulado + (rec?.state === 'recording' ? (Date.now() - inicioTrecho) / 1000 : 0);

async function manterTelaLigada() {
  try {
    trava = await navigator.wakeLock?.request('screen');
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && gravando()) manterTelaLigada();
});

async function comecar() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    aviso('Sem acesso ao microfone. Libere em Ajustes › Safari › Microfone.');
    return;
  }
  navigator.storage?.persist?.();
  const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  rec = new MediaRecorder(stream, tipo ? { mimeType: tipo, audioBitsPerSecond: 64000 } : {});
  pedacos = [];
  acumulado = 0;
  rec.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
  rec.onpause = () => (acumulado += (Date.now() - inicioTrecho) / 1000);
  rec.onresume = () => (inicioTrecho = Date.now());
  rec.start(1000);
  inicioTrecho = Date.now();
  const criadoEm = Date.now();

  // Guarda um rascunho a cada 10 s: se o Safari fechar, a gravação não se perde.
  salvaRascunho = setInterval(() => {
    guardar({ id: 'rascunho', criadoEm, duracao: tempoGravado(), mime: rec.mimeType, audio: new Blob(pedacos, { type: rec.mimeType }) });
  }, 10000);

  manterTelaLigada();
  ligarMedidor(stream);
  relogio = setInterval(() => ($('#tempo').textContent = hhmmss(tempoGravado())), 250);
  $('#tempo').textContent = '0:00';
  $('#pausar').textContent = 'Pausar';
  location.hash = '';
  mostrar('gravar');
}

function ligarMedidor(s) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  ctx.createMediaStreamSource(s).connect(an);
  const dados = new Uint8Array(an.fftSize);
  const barras = [...document.querySelectorAll('#nivel i')];
  const historico = new Array(barras.length).fill(0);
  const passo = () => {
    an.getByteTimeDomainData(dados);
    let pico = 0;
    for (const v of dados) pico = Math.max(pico, Math.abs(v - 128));
    historico.push(rec?.state === 'paused' ? 0 : Math.min(1, pico / 64));
    historico.shift();
    barras.forEach((b, i) => (b.style.transform = `scaleY(${0.06 + historico[i] * 0.94})`));
    medidor = requestAnimationFrame(passo);
  };
  passo();
  ligarMedidor.ctx = ctx;
}

function desligarTudo() {
  clearInterval(relogio);
  clearInterval(salvaRascunho);
  cancelAnimationFrame(medidor);
  ligarMedidor.ctx?.close();
  stream?.getTracks().forEach((t) => t.stop());
  trava?.release?.();
  trava = null;
}

async function parar() {
  if (!gravando()) return;
  const terminou = new Promise((ok) => (rec.onstop = ok));
  if (rec.state === 'recording') acumulado += (Date.now() - inicioTrecho) / 1000;
  rec.onpause = null;
  rec.stop();
  await terminou;
  desligarTudo();
  const g = novaGravacao(new Blob(pedacos, { type: rec.mimeType }), acumulado);
  rec = null;
  await guardar(g);
  await apagar('rascunho');
  location.hash = 'g/' + g.id;
  if (ajustes().auto) transcrever(g.id);
}

function novaGravacao(audio, duracao, titulo) {
  const agora = Date.now();
  return {
    id: String(agora),
    titulo: titulo || 'Gravação ' + dataCurta(agora),
    criadoEm: agora,
    duracao,
    mime: audio.type,
    audio,
    template: ajustes().template,
    transcricao: '',
    segmentos: [],
    resumo: '',
  };
}

$('#gravar').addEventListener('click', comecar);
$('#parar').addEventListener('click', parar);
$('#pausar').addEventListener('click', () => {
  if (!gravando()) return;
  if (rec.state === 'recording') {
    rec.pause();
    $('#pausar').textContent = 'Continuar';
    $('#v-gravar').classList.add('pausado');
  } else {
    rec.resume();
    $('#pausar').textContent = 'Pausar';
    $('#v-gravar').classList.remove('pausado');
  }
});

// Importar áudio (ex.: do app Gravador da Apple, que grava com a tela bloqueada)
$('#importar').addEventListener('change', async (e) => {
  const arq = e.target.files?.[0];
  e.target.value = '';
  if (!arq) return;
  const dur = await new Promise((ok) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => ok(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => ok(0);
    a.src = URL.createObjectURL(arq);
  });
  const g = novaGravacao(arq, dur, arq.name.replace(/\.[^.]+$/, ''));
  await guardar(g);
  location.hash = 'g/' + g.id;
});

// ---------- detalhe ----------
let atual = null;
let urlAudio = null;

async function abrirDetalhe(id) {
  const g = await pegar(id);
  if (!g) return (location.hash = '');
  atual = g;
  mostrar('detalhe');
  $('#titulo').value = g.titulo;
  $('#quando').textContent = `${dataCurta(g.criadoEm)} · ${hhmmss(g.duracao)}`;
  if (urlAudio) URL.revokeObjectURL(urlAudio);
  urlAudio = URL.createObjectURL(g.audio);
  $('#player').src = urlAudio;
  $('#template').innerHTML = Object.entries(MODELOS)
    .map(([k, m]) => `<option value="${k}" ${k === (g.template || 'reuniao') ? 'selected' : ''}>${m.nome}</option>`)
    .join('');
  renderDetalhe();
}

function renderDetalhe() {
  const g = atual;
  const ocupado = transcrevendo === g.id;
  $('#transcrever').hidden = !!g.transcricao || ocupado;
  $('#progresso').hidden = !ocupado;
  $('#acoes-resumo').hidden = !g.transcricao;
  $('#resumo').innerHTML = g.resumo ? markdown(g.resumo) : '<p class="dica">Ainda sem resumo.</p>';
  $('#resumo-box').hidden = !g.transcricao && !g.resumo;
  const segs = g.segmentos?.length ? g.segmentos : g.transcricao ? [{ inicio: 0, texto: g.transcricao }] : [];
  $('#texto').innerHTML = segs.length
    ? segs.map((s) => `<p><button class="ts" data-t="${s.inicio}">${hhmmss(s.inicio)}</button> ${esc(s.texto)}</p>`).join('')
    : ocupado
      ? ''
      : '<p class="dica">Toque em “Transcrever” para gerar o texto. Tudo acontece no seu iPhone.</p>';
  $('#editar').hidden = !g.transcricao;
}

$('#texto').addEventListener('click', (e) => {
  const t = e.target.closest('.ts');
  if (!t) return;
  const p = $('#player');
  p.currentTime = Number(t.dataset.t);
  p.play();
});

$('#titulo').addEventListener('change', async () => {
  atual.titulo = $('#titulo').value.trim() || atual.titulo;
  await guardar(atual);
});
$('#template').addEventListener('change', async () => {
  atual.template = $('#template').value;
  await guardar(atual);
  const a = ajustes();
  a.template = atual.template;
  salvarAjustes(a);
});

$('#editar').addEventListener('click', () => {
  const area = $('#edicao');
  if (area.hidden) {
    area.value = atual.transcricao;
    area.hidden = false;
    $('#texto').hidden = true;
    $('#editar').textContent = 'Salvar texto';
    area.focus();
  } else {
    atual.transcricao = area.value.trim();
    atual.segmentos = [];
    guardar(atual);
    area.hidden = true;
    $('#texto').hidden = false;
    $('#editar').textContent = 'Editar texto';
    renderDetalhe();
  }
});

$('#excluir').addEventListener('click', async () => {
  if (!confirm('Excluir esta gravação? Não dá para desfazer.')) return;
  await apagar(atual.id);
  location.hash = '';
});

$('#compartilhar').addEventListener('click', async () => {
  const g = atual;
  const texto = `${g.titulo}\n${dataCurta(g.criadoEm)}\n\n${g.resumo ? g.resumo + '\n\n' : ''}${g.transcricao ? '## Transcrição\n' + g.transcricao : ''}`;
  try {
    await navigator.share({ title: g.titulo, text: texto });
  } catch (e) {
    if (e.name !== 'AbortError') {
      await navigator.clipboard?.writeText(texto);
      aviso('Texto copiado.');
    }
  }
});
$('#compartilhar-audio').addEventListener('click', async () => {
  const g = atual;
  const ext = g.mime.includes('mp4') ? 'm4a' : g.mime.includes('webm') ? 'webm' : (g.audio.name || '').split('.').pop() || 'audio';
  const arq = new File([g.audio], `${g.titulo}.${ext}`, { type: g.mime || g.audio.type });
  try {
    if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: g.titulo });
    else aviso('Este navegador não compartilha arquivos.');
  } catch {}
});

// ---------- transcrição no aparelho ----------
let worker = null;
let transcrevendo = null;

async function audioPara16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const dec = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(dec.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = dec;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

async function transcrever(id) {
  if (transcrevendo) return aviso('Já tem uma transcrição em andamento.');
  const g = await pegar(id);
  transcrevendo = id;
  if (atual?.id === id) renderDetalhe();
  const barra = $('#progresso progress');
  const rotulo = $('#progresso span');
  rotulo.textContent = 'Preparando o áudio…';
  barra.removeAttribute('value');
  manterTelaLigada();

  let audio;
  try {
    audio = await audioPara16k(g.audio);
  } catch {
    transcrevendo = null;
    renderDetalhe();
    return aviso('Não consegui ler este áudio.');
  }

  worker ??= new Worker('./worker.js', { type: 'module' });
  const { modelo, idioma } = ajustes();
  const baixados = new Map();
  const t0 = Date.now();

  worker.onmessage = async ({ data }) => {
    if (data.tipo === 'download') {
      baixados.set(data.arquivo, [data.carregado, data.total]);
      let c = 0;
      let t = 0;
      for (const [a, b] of baixados.values()) (c += a), (t += b);
      barra.value = c / t;
      rotulo.textContent = `Baixando o modelo (só na 1ª vez): ${Math.round(c / 1e6)} de ${Math.round(t / 1e6)} MB`;
    } else if (data.tipo === 'pronto') {
      barra.value = 0;
      rotulo.textContent = data.dispositivo === 'webgpu' ? 'Transcrevendo com a GPU do iPhone…' : 'Transcrevendo…';
    } else if (data.tipo === 'progresso') {
      barra.value = data.fracao;
      const pct = Math.round(data.fracao * 100);
      const passou = (Date.now() - t0) / 1000;
      const falta = data.fracao > 0.05 ? (passou / data.fracao) * (1 - data.fracao) : null;
      rotulo.textContent = `Transcrevendo… ${pct}%${falta ? ` · falta ~${hhmmss(falta)}` : ''}`;
      if (atual?.id === id) {
        atual.segmentos = data.segmentos;
        atual.transcricao = data.segmentos.map((s) => s.texto).join(' ');
        renderDetalhe();
      }
    } else if (data.tipo === 'fim') {
      const g2 = await pegar(id);
      g2.segmentos = data.segmentos;
      g2.transcricao = data.segmentos.map((s) => s.texto).join(' ');
      if (!g2.resumo && g2.transcricao) g2.resumo = resumoEmTexto(g2.transcricao);
      await guardar(g2);
      transcrevendo = null;
      if (atual?.id === id) (atual = g2), renderDetalhe();
      aviso(g2.transcricao ? 'Transcrição pronta.' : 'Não encontrei fala neste áudio.');
      if (!gravando()) trava?.release?.();
    } else if (data.tipo === 'erro') {
      transcrevendo = null;
      if (atual?.id === id) renderDetalhe();
      aviso('Erro na transcrição: ' + data.mensagem, 6000);
    }
  };
  worker.postMessage({ tipo: 'transcrever', audio, modelo, idioma }, [audio.buffer]);
}
$('#transcrever').addEventListener('click', () => transcrever(atual.id));

// ---------- resumos ----------
$('#resumo-rapido').addEventListener('click', async () => {
  atual.resumo = resumoEmTexto(atual.transcricao);
  await guardar(atual);
  renderDetalhe();
});

// Apple Intelligence: o Atalho lê o texto da área de transferência, resume com o
// modelo do próprio iPhone e devolve o resultado na área de transferência.
let aguardandoAtalho = null;
$('#resumo-apple').addEventListener('click', async () => {
  const prompt = montarPrompt($('#template').value, atual.transcricao);
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    return aviso('Não consegui copiar o texto.');
  }
  aguardandoAtalho = { id: atual.id, prompt };
  $('#colar').hidden = false;
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(ajustes().atalho)}&input=clipboard`;
});
$('#colar').addEventListener('click', async () => {
  let texto = '';
  try {
    texto = (await navigator.clipboard.readText()).trim();
  } catch {
    return aviso('Permita colar quando o iPhone perguntar.');
  }
  if (!texto || texto === aguardandoAtalho?.prompt) return aviso('O atalho ainda não devolveu o resumo.');
  const g = await pegar(aguardandoAtalho?.id || atual.id);
  g.resumo = texto;
  await guardar(g);
  aguardandoAtalho = null;
  $('#colar').hidden = true;
  if (atual?.id === g.id) (atual = g), renderDetalhe();
  aviso('Resumo do Apple Intelligence salvo.');
});

function markdown(md) {
  const linhas = esc(md).split('\n');
  let html = '';
  let lista = false;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const l of linhas) {
    const item = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(\[[ x]\]\s*)?(.*)$/i);
    if (item) {
      if (!lista) (html += '<ul>'), (lista = true);
      html += `<li${item[1] ? ' class="todo"' : ''}>${inline(item[2])}</li>`;
      continue;
    }
    if (lista) (html += '</ul>'), (lista = false);
    const h = l.match(/^#{1,4}\s+(.*)$/) || l.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (h) html += `<h3>${inline(h[1])}</h3>`;
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  return html + (lista ? '</ul>' : '');
}

// ---------- ajustes ----------
async function abrirAjustes() {
  const a = ajustes();
  mostrar('ajustes');
  $('#aj-modelo').value = a.modelo;
  $('#aj-idioma').value = a.idioma;
  $('#aj-atalho').value = a.atalho;
  $('#aj-auto').checked = !!a.auto;
  const est = await navigator.storage?.estimate?.();
  $('#uso').textContent = est ? `${Math.round(est.usage / 1e6)} MB usados neste aparelho` : '';
  const gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null)));
  $('#gpu').textContent = gpu ? 'GPU disponível (WebGPU): transcrição rápida.' : 'Sem WebGPU: a transcrição usa a CPU e fica mais lenta.';
}
for (const id of ['aj-modelo', 'aj-idioma', 'aj-atalho', 'aj-auto']) {
  $('#' + id).addEventListener('change', () =>
    salvarAjustes({
      ...ajustes(),
      modelo: $('#aj-modelo').value,
      idioma: $('#aj-idioma').value,
      atalho: $('#aj-atalho').value.trim() || PADRAO.atalho,
      auto: $('#aj-auto').checked,
    })
  );
}

// ---------- início ----------
async function recuperarRascunho() {
  const r = await pegar('rascunho');
  if (!r || !r.audio?.size) return;
  const g = novaGravacao(r.audio, r.duracao, 'Gravação recuperada ' + dataCurta(r.criadoEm));
  g.criadoEm = r.criadoEm;
  await guardar(g);
  await apagar('rascunho');
  aviso('Recuperei uma gravação que não tinha sido finalizada.', 5000);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
recuperarRascunho().finally(rota);
