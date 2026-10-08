---
name: checar-followups
description: Revisa memoria/followups.md, identifica o que venceu ou está para vencer, prepara as cobranças no degrau certo da escada e avisa Felipe só do que importa. Use na rotina agendada ou quando Felipe disser "checa as pendências", "o que está atrasado", "cobra o pessoal".
---

# Checar follow-ups

1. Leia `memoria/followups.md`, `memoria/autorizacoes.md` e `memoria/acessos.md`. Data/hora de referência: agora em America/Sao_Paulo.
2. Para cada linha aberta, classifique:
   - **ok** — próxima verificação no futuro → não faça nada.
   - **verificar** — próxima verificação chegou → se houver acesso (Gmail/GitHub/Drive), procure resposta do responsável desde a última cobrança. Se respondeu e resolveu, encerre a linha (mova para "Encerrados" com o resultado).
   - **cobrar** — sem resposta e prazo próximo/vencido → prepare a cobrança no degrau da escada (`Cobranças` = 0 cordial, 1 objetiva, prazo vencido firme, reincidência crítica = proposta de escalar).
3. Cobranças: siga o nível em `autorizacoes.md`. No Nível 1, crie **rascunho** no Gmail (se conectado) ou escreva o texto pronto na resposta. **Nunca envie** sem autorização registrada para essa rotina.
4. Atualize cada linha mexida: `Próx. verificação`, `Cobranças`, `Status`. Acrescente linhas em `memoria/log.md`.
5. Commit + push: `git add memoria && git commit -m "sofia: checagem de follow-ups" && git push`.
6. Responda a Felipe **apenas** se houver algo Urgente ou Importante, neste formato:

   ### Follow-ups — <data hora>
   **Vencidos:** item — responsável — há N dias — rascunho pronto (sim/não)
   **Precisa de você:** decisão objetiva (ex.: escalar X ao gestor?)
   Responda: **PODE** / **AJUSTAR** / **ESPERA**

   Se nada mudou, responda só "Follow-ups ok — nada pendente." e não gere notificação.
