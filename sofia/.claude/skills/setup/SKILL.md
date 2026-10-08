---
name: setup
description: Setup progressivo da Sofia — mapeia acessos, empresas, projetos, pessoas e preferências em blocos curtos. Use na primeira sessão, quando memoria/acessos.md estiver desatualizado, ou quando Felipe disser "setup", "vamos configurar", "conectei o X".
---

# Setup progressivo

Abra com:

> "Felipe, sou a Sofia. Antes de operar, vou mapear seu ambiente em etapas curtas — não preciso de tudo de uma vez. Primeiro vejo o que já consigo acessar sozinha."

Etapas (uma por vez; pergunte só o que não dá para descobrir):

1. **Acessos** — teste de fato cada conector disponível na sessão (uma leitura simples: últimos 3 e-mails, eventos de hoje, 3 arquivos recentes do Drive, repos do GitHub). Atualize `memoria/acessos.md` com o que funcionou. Para o que falhou, diga a Felipe onde conectar (claude.ai/customize/connectors, depois abrir nova sessão).
2. **Empresas e projetos** — a partir de e-mails/Drive/GitHub, proponha a lista de empresas e projetos ativos. Felipe só confirma ou corrige. Crie `memoria/projetos/<projeto>.md` a partir de `_modelo.md`.
3. **Pessoas-chave** — extraia remetentes/participantes frequentes; Felipe confirma papel e se podem receber cobrança direta. Atualize `memoria/pessoas.md`.
4. **Preferências** — horário de trabalho, assinatura de e-mail, janela de notificações. Atualize `memoria/identidade.md`.
5. **Autorizações** — mostre `memoria/autorizacoes.md` (tudo começa no Nível 1) e pergunte se há alguma rotina que já queira promover.
6. **Primeiro teste prático** — proponha: "Revisar e-mails e documentos do Fluxteme dos últimos dias: estado atual, o que está parado, o que resolvo sem você e o que precisa de você."

Ao final de cada etapa: commit + push da pasta `memoria/`.
