# Sofia — agente executiva pessoal do Felipe

Sofia roda como uma sessão do **Claude Code** aberta neste repositório (web, celular ou desktop).
- `CLAUDE.md` = identidade e regras (carregado automaticamente em toda sessão).
- `memoria/` = estado persistente (projetos, follow-ups, decisões, autorizações, log). Versionado no git = auditável.
- `.claude/skills/` = rotinas: `setup`, `decisao`, `checar-followups`.
- `especialistas/` = propostas de subagentes (ativados só com aprovação, em `.claude/agents/`).

## Instalação (uma vez)

1. **Criar o repositório** `fluxteme-spec/sofia` (privado, vazio) em github.com/new.
2. **Copiar esta pasta** para a raiz dele (numa sessão do Claude Code: "copie a pasta sofia/ do branch claude/youthful-albattani-ryix5c do lemais para a raiz do repo sofia e dê push").
3. **Conectar Google** (Gmail, Calendar, Drive) em https://claude.ai/customize/connectors.
4. **Abrir uma nova sessão** do Claude Code no repo `sofia` e dizer: **"Sofia, vamos fazer o setup."**
5. **Rotina de follow-ups**: na mesma sessão, pedir: *"Crie uma rotina que roda em dias úteis às 9h, 13h e 17h (America/Sao_Paulo), abre uma sessão nova no repo sofia e executa a skill checar-followups."*

## Plano de evolução

- **Fase 1 (agora):** Sofia no Claude Code + Gmail/Calendar/Drive/GitHub. Nível 1 (prepara, não envia). Validar comportamento, ajustar o `CLAUDE.md`, popular a memória.
- **Fase 2:** promover rotinas homologadas (níveis 2–4), ativar primeiros especialistas (Mail, Projects), fechamento diário, briefing da manhã.
- **Fase 3:** WhatsApp, ERP, emissão de NF, CRM, outros modelos — cada um só entra em `memoria/acessos.md` quando estiver conectado de verdade.

## Primeiro teste prático

> "Sofia, revisa os e-mails e documentos do Fluxteme dos últimos dias. Me diga o estado atual do projeto, o que está parado, o que pode ser resolvido sem mim e quais decisões realmente precisam de mim."

Depois: *"Prepare tudo que for baixo risco e me traga as decisões restantes."*

## Critério de sucesso

Felipe precisa lembrar menos, procurar menos, decide mais rápido, recebe menos mensagens inúteis, tarefas não somem, follow-ups acontecem e rotinas repetitivas pedem cada vez menos intervenção.

## O que mudou da v0.1 para a v0.2

- Memória deixou de ser abstrata: virou arquivos em `memoria/` com regra explícita de leitura (início) e escrita + commit (fim).
- Autorizações viraram um registro (`autorizacoes.md`); padrão = Nível 1.
- `acessos.md` impede a Sofia de prometer ação em sistema não conectado.
- Follow-up ganhou mecanismo real (skill + rotina agendada).
- Setup, plano de fases, arquitetura e teste prático saíram do prompt e vieram para este README (prompt ~60% menor = mais barato por sessão).
- Roteamento entre IAs (ChatGPT/Gemini) adiado para a Fase 2 — hoje não há integração.
