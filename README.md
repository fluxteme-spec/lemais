# LêMais

Aplicativo web para leitura guiada, experimentação de ritmo e teste opcional de compreensão.

> Ler mais rápido só importa se você continuar entendendo.

Fluxo completo: **conteúdo → preparação → leitura → questionário opcional → resultado → histórico**. Funciona sem cadastro; os dados ficam no navegador (IndexedDB).

## Como executar

Para testar com dois cliques, veja `COMO-TESTAR.md`.

Requisitos: Node.js 20 ou superior.

```bash
npm install
cp .env.example .env.local   # opcional
npm run dev                  # http://localhost:3000
```

Produção:

```bash
npm run build
npm start
```

Verificações:

```bash
npm test          # testes automatizados (Vitest)
npm run typecheck # verificação de tipos
```

### IA para os questionários (conta do próprio usuário)

Cada usuário conecta a própria IA em **Configurações → Conectar minha IA** (`/conectar-ia`):

- **Entrar com OpenRouter** (OAuth com PKCE): login na conta OpenRouter, que aceita entrar com Google, e acesso a modelos da OpenAI, Anthropic, Google e outros. O app recebe uma chave controlada pelo usuário, que pode ser revogada no OpenRouter.
- **Chave de provedor:** Google Gemini, OpenAI, Anthropic ou OpenRouter.

A lista de modelos vem da conta do usuário e o app sugere um modelo rápido e econômico, sem nomes fixos no código. As chamadas saem **direto do navegador** para o provedor: a chave fica só no navegador (IndexedDB) e o texto não passa pelo servidor do LêMais. A política de segurança de conteúdo (CSP) só permite conexões com esses quatro provedores. Antes da primeira geração com cada provedor, o usuário é avisado de que o texto será enviado à conta dele.

Assinaturas de consumidor (ChatGPT Plus, Claude Pro, Gemini Advanced) não podem ser usadas por apps de terceiros, por isso o acesso é via API ou OpenRouter.

Opcional: o dono da instalação pode definir `ANTHROPIC_API_KEY` no servidor, usado apenas quando o usuário não conectou nenhuma IA.

## Fase 1 — app web instalável, contas e painel

- **PWA:** instalável no celular e no computador (Configurações → Instalar). Um service worker guarda o app para abrir sem conexão. Texto já salvo no aparelho continua acessível; importação, login, IA e sincronização precisam de internet.
- **Login com Google ou e-mail** (código de 6 números), via Supabase Auth. Login com Apple fica para quando houver conta Apple Developer. Ler continua funcionando sem conta.
- **Cadastro:** nome, confirmação de 13 anos ou mais e aceite de Termos e Privacidade (`/termos`, `/privacidade`; revise com um advogado antes de divulgar).
- **Sincronização:** textos, leituras, questionários e preferências vão para a conta e chegam aos outros aparelhos. Vale a alteração mais recente, e exclusões também sincronizam. A chave de IA nunca sai do aparelho. Ao sair da conta, os dados do aparelho são apagados (continuam na conta). Excluir a conta apaga tudo.
- **Painel do desenvolvedor** (`/admin`, só para os e-mails em `ADMIN_EMAILS`):
  - indicadores: usuários, novos, ativos, quem voltou, convites, leituras e propagandas;
  - usuários: busca, suspensão (bloqueia o login) e exclusão;
  - propagandas: local, período, prévia, exibições e cliques;
  - textos sugeridos: até 3 perguntas validadas contra o texto, com sugestão pela IA do administrador.
- **Propagandas:** marcadas como "Patrocinado". Aparecem só no Início, Treinar, Resultado e Progresso, nunca durante a leitura ou o questionário. Contagem anônima e limitada por IP.
- **Adaptar o texto** com a IA do usuário: mais simples, científico, acadêmico ou clássico (séc. XIX).
  - O original é preservado e a versão adaptada vira um novo texto marcado.
  - Ela ganha perguntas próprias e fica fora das médias de comparação.
  - Há proteção contra respostas que resumem ou inflam o texto.
- **Questionário:** no máximo 3 perguntas curtas (ideia central, desenvolvimento e conclusão).
- **Compartilhar** (com conta):
  - cartão com a marca, o título, a fonte, um trecho opcional de até 200 caracteres e o desempenho, e uma página pública com prévia para redes sociais;
  - WhatsApp por link e Facebook pela prévia da página;
  - Instagram: imagem no formato Stories pela folha de compartilhamento do celular, ou download;
  - quem entra pelo link fica registrado como convidado.

Configuração passo a passo: `CONFIGURAR-SUPABASE.md`. Banco: `supabase/setup-completo.sql` (o mesmo de `supabase/migrations`). Todas as tabelas usam RLS. As gravações do painel passam por ações no servidor que verificam o e-mail do administrador antes de usar a chave secreta.

### Verificações da Fase 1

- `npm test`: 104 testes passando (inclui sincronização entre dois aparelhos simulados, exclusões e conflitos).
- Build de produção e checagem de tipos sem erros.
- Teste de ponta a ponta no navegador com Supabase local (Docker), sem erros no console:
  - leitura sem conta, login por código e envio das leituras do aparelho para a conta;
  - cartão, imagem Stories, página pública com prévia e link do WhatsApp;
  - convite registrado; segundo aparelho recebendo as leituras;
  - painel: indicadores, propaganda criada e exibida no resultado com contagem, texto sugerido com 3 perguntas lido e corrigido, suspensão de usuário;
  - adaptação com IA simulada;
  - `/admin` oculto para quem não é administrador;
  - Treinar abrindo sem conexão.
- Não testado: login real com Google (precisa das credenciais do Google Cloud), envio de e-mail real (testado com o servidor de e-mail local do Supabase) e IA real.

## O que está incluído (base)

- **Entrada:** texto colado, importação por link (extração no servidor com Readability) e 6 textos originais de treino (2 fáceis, 2 intermediários, 2 avançados), cada um com questionário revisado.
- **Preparação:** título editável, fonte, autoria, data, link, prévia, edição do texto, contagem de palavras, modo, ritmo e tempo estimado.
- **Modos:** palavra a palavra (RSVP), por blocos (2, 3, 4 ou automático), texto guiado e texto livre.
- **Controles:** 100 a 1.000 PPM (passo 25, atalhos 200 a 600), pausas inteligentes, letra de referência, tamanho do texto, entrelinha, tema claro/escuro.
- **Atalhos:** Espaço (começar/pausar), ← → (frase anterior/próxima), ↑ ↓ (±25 PPM), Esc (pausar). Ignorados enquanto se digita.
- **Questionário opcional**, correção após o envio, evidência no texto, reporte de questão, consulta registrada como “com consulta” e revisões separadas da primeira tentativa.
- **Histórico local**, recuperação de sessão (sempre retoma pausada), exclusão de sessão, de texto e de todos os dados.
- **PWA:** manifesto e ícones (sem cache offline; ver limitações).

## Métricas (metricsVersion 1)

| Métrica | Definição |
|---|---|
| `activeDurationMs` | Tempo em leitura, incluindo pausas inteligentes programadas pelo motor. |
| `pausedDurationMs` | Tempo em pausa manual ou com a aba oculta. |
| `presentedWordCount` | Apresentações de palavras, incluindo repetições (voltar e reler). |
| `uniquePresentedWordCount` | Posições distintas exibidas. **Não** são palavras comprovadamente lidas. |
| `observedWpm` | Apresentações ÷ minutos ativos. No texto livre: total de palavras ÷ minutos ativos, identificado como estimativa. |
| `coveragePercent` | Posições distintas ÷ total de palavras (modos automáticos). |
| `comprehensionScore` | Acertos ÷ questões respondidas, ou `null` se não houve teste. |

Regras: avançar manualmente não marca palavras puladas como apresentadas; sessões com menos de 10 s ativos mostram “Dados insuficientes”; a média de compreensão usa só a primeira tentativa de sessões avaliadas e separa testes com e sem consulta.

Navegação: os botões e as setas ← → movem **uma frase** (intertítulos contam como frase).

## Arquitetura

```
src/lib/text          tokenização única (preparação, leitor, métricas, evidências)
src/lib/reader        Reader Engine (independente da UI) e formação de blocos/duração
src/lib/metrics       definições e cálculo das métricas
src/lib/persistence   Repository + IndexedDB (ponto de extensão para persistência remota)
src/lib/extract       download seguro (SSRF) e extração editorial
src/lib/comprehension validação de questões e provedor de IA
src/lib/training      biblioteca de textos originais
src/app               telas (Next.js App Router) e rotas /api/extract, /api/questions
```

Limites e multiplicadores ficam em `src/lib/config/index.ts`.

### Segurança da importação

- Só http/https, sem credenciais na URL, portas 80/443.
- O IP é validado **na conexão** (lookup customizado do socket): o endereço conferido é o usado, evitando DNS rebinding. Bloqueia loopback, redes privadas, link-local, metadados de nuvem, reservados, multicast, IPv6 equivalentes e IPv4 embutido em IPv6.
- Cada redirecionamento é revalidado (máx. 3). Tempo total de 15 s, 5 MB descomprimidos (interrompe sem confiar em Content-Length; protege contra bomba de compressão). Só HTML/XHTML.
- Sem cookies ou autenticação, sem sub-recursos, sem execução de scripts. O cliente recebe apenas blocos de texto, nunca HTML.
- Limites por IP e de concorrência (em memória; num ambiente distribuído, troque por armazenamento compartilhado).
- Logs registram só o domínio e o código do erro, nunca a URL completa ou o texto.

## Resultado das verificações

Executadas nesta entrega:

- `npm test`: 98 testes passando (tokenização, blocos e durações, provedores de IA no navegador e login OpenRouter com PKCE, motor com relógio simulado, métricas, SSRF, download seguro contra servidor local, extração com fixtures, questionários, biblioteca e persistência com IndexedDB simulado).
- `npm run typecheck` e `npm run build`: sem erros.
- Teste de ponta a ponta em Chromium headless contra o build de produção: primeiro acesso, colar texto, RSVP, aba oculta pausando sem avançar, recarregar e retomar pausado, troca de modo com posição preservada, sessão parcial, texto de treino até o fim, questionário, revisão, histórico, link para destino interno recusado, texto livre com ritmo estimado, larguras de 360, 768 e 1280 px, tema escuro e layout sem rolagem horizontal com zoom equivalente a 200%.
- Importação real de um artigo público (Wikipédia) concluída com sucesso.

- Fluxo de IA do usuário no navegador com provedor simulado: convite para conectar, redirecionamento do login OpenRouter com PKCE, chave inválida recusada, sugestão de modelo, aviso de envio, questionário gerado e corrigido, sem bloqueios da CSP.

Não executado: lint (não configurado), auditoria com leitor de tela real e chamadas reais a OpenRouter, Gemini, OpenAI e Anthropic (sem credenciais neste ambiente).

## Limitações conhecidas

- A importação não executa JavaScript; páginas que montam o texto só no navegador não serão extraídas. Não há compatibilidade universal com sites.
- “Possível restrição de acesso” só é indicada quando o próprio site sinaliza conteúdo restrito ou responde 401/402.
- Dados ficam apenas neste navegador; não há sincronização entre dispositivos.
- Sem modo offline completo: o manifesto não implica funcionamento offline. Importação e geração por IA exigem conexão.
- O bloco automático usa heurística de pontuação, não análise linguística.
- A dificuldade dos textos de treino é editorial e aproximada; conteúdos externos ficam “não classificados”.
- Questionários de IA são validados (esquema, evidência literal, alternativas distintas), o que não garante perguntas boas; por isso há reporte.
- Textos acima de 40 mil caracteres não recebem geração automática de questões nesta versão.

## Próximas etapas (não implementadas)

Treino de avanço, percepção visual, skimming, scanning, ritmo adaptativo entre sessões, treinos rápidos de 3/5/10 min, avaliação de retenção posterior, faixa eficiente experimental, conta e sincronização (PostgreSQL com isolamento por usuário, via a interface `Repository`), cache offline e lint.

## Tag NFC (app à parte em `/nfc`)

PWA independente para **ler e gravar tags NFC**, em `public/nfc/` (HTML, CSS e JS puros, sem build). Com o site no ar, abra `https://SEU-DOMINIO/nfc` no **Chrome do Android** e use **Instalar**.

- **Ler:** número de série (UID) em vários formatos — original, sem dois-pontos, bytes invertidos (`A3:2B:CC:11` → `11CC2BA3`), decimal, decimal invertido, 10 dígitos e Wiegand 26 — e o conteúdo NDEF (texto, link, telefone, Wi-Fi, contato, JSON, Smart Poster, bytes em hex). Leitura contínua opcional.
- **Gravar:** texto, link, telefone, WhatsApp, e-mail, SMS, Wi-Fi, contato (vCard), localização e JSON; vários registros na mesma tag; copiar uma tag lida para outra.
- **Ferramentas:** apagar tag, bloquear tag (permanente, com confirmação) e conversor de UID.
- **Histórico** de leituras no aparelho, com exportação CSV (abre no Excel).

Limitações da Web NFC: só Chrome/Android com NFC ligado e página em https; iPhone não suporta. Tags MIFARE Classic só funcionam em celulares com chip NXP, e a Web NFC lê apenas conteúdo NDEF (não lê setores/blocos crus).
