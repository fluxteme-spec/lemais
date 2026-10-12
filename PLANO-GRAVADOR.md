# Plano: Gravador com IA dentro do LêMais

Aprovado em 12/10/2026, pergunta a pergunta.

## Decisões
| # | Tema | Decisão |
|---|---|---|
| 1 | Acesso | **Os dois:** Botão de Ação → gravador nativo (funciona com tela bloqueada) → Atalho envia o áudio ao LêMais; e Atalho/Siri que abre o LêMais já gravando, para notas curtas. |
| 2 | Transcrição | **IA conectada** (chave só no iPhone; separa quem fala) **ou Whisper no iPhone** (grátis, offline). Padrão em Ajustes, troca por gravação. Nada processado no servidor. |
| 3 | Nuvem | **Texto sincroniza; áudio só de passagem**: o envio do Atalho fica na caixa de entrada até ser processado e é apagado da nuvem; o áudio fica no iPhone. |
| 4 | Persona | **Biblioteca de personas avulsas**, escolhidas a cada gravação (última usada vem pré-selecionada). Projetos só organizam. 4 personas prontas e editáveis: Juliana, Gestor ConnectVending, Professora de italiano, Secretária executiva. |
| 5 | Saídas automáticas | **Resumo, Tarefas e Mapa mental** ao fim da transcrição. **Ata e Relatório** a um toque. Tarefas → Lembretes do iPhone via Atalho. |
| 6 | Mapa 3D | **Grafo 3D dinâmico estilo Obsidian**: física, arrastar nós, destacar vizinhos, tamanho por conexões, cores por tema, filtro. |
| 7 | Alcance do grafo | **Por gravação + Grafo Geral** ligando assuntos repetidos entre gravações; filtro por projeto e período. |
| 8 | Compartilhar | **Folha do iPhone**, **PDF com marca** (ata/relatório) e **link público** opcional (desligado por padrão, validade de 7 dias, revogável, sem áudio). |
| 9 | Publicação | **Por etapas**: novo Supabase "lemais" (São Paulo, grátis) + Vercel; cada fase vai ao ar quando pronta. |

## Fases
1. **Gravador no LêMais + 1ª publicação** — seção Gravar (gravar, importar, Whisper no iPhone, busca), Supabase novo, Vercel no ar.
2. **IA conectada + personas + projetos** — transcrição pela IA do usuário, biblioteca de personas, projetos.
3. **Saídas** — resumo, tarefas, mapa (estrutura), ata, relatório; tarefas → Lembretes.
4. **Grafo 3D** — por gravação e Grafo Geral (3d-force-graph empacotado localmente, respeitando a CSP).
5. **Automação iPhone** — Atalhos prontos (Botão de Ação, Siri, widget), endpoint de envio com token pessoal revogável, caixa de entrada.
6. **Compartilhar** — folha do iPhone, PDF, link público.

Cada fase: testes (Vitest), typecheck, build e teste de ponta a ponta no navegador antes de publicar.
