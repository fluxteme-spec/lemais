# LêMais

Aplicativo web para leitura guiada, experimentação de ritmo e teste opcional de compreensão.

> Ler mais rápido só importa se você continuar entendendo.

Fluxo completo: **conteúdo → preparação → leitura → questionário opcional → resultado → histórico**. Funciona sem cadastro; os dados ficam no navegador (IndexedDB).

## Como executar

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

### Habilitar questionários por IA

Sem configuração, tudo funciona: a biblioteca de treino tem questionários revisados, e textos colados ou importados podem ser lidos normalmente, com o aviso de que o teste automático está indisponível.

Para gerar questionários de textos colados ou importados, defina no `.env.local`:

```
ANTHROPIC_API_KEY=sua-chave
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # opcional
```

A chave só é usada no servidor (`/api/questions`). Antes da primeira geração, o usuário é avisado de que o texto será enviado ao provedor.

## O que está incluído

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

- `npm test`: 90 testes passando (tokenização, blocos e durações, motor com relógio simulado, métricas, SSRF, download seguro contra servidor local, extração com fixtures, questionários, biblioteca e persistência com IndexedDB simulado).
- `npm run typecheck` e `npm run build`: sem erros.
- Teste de ponta a ponta em Chromium headless contra o build de produção: primeiro acesso, colar texto, RSVP, aba oculta pausando sem avançar, recarregar e retomar pausado, troca de modo com posição preservada, sessão parcial, texto de treino até o fim, questionário, revisão, histórico, link para destino interno recusado, texto livre com ritmo estimado, larguras de 360, 768 e 1280 px, tema escuro e layout sem rolagem horizontal com zoom equivalente a 200%.
- Importação real de um artigo público (Wikipédia) concluída com sucesso.

Não executado: lint (não configurado), auditoria com leitor de tela real e teste com chave de IA real (a integração foi testada com provedor simulado).

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
