# Risco Adaptativo e Dashboard Incremental — Design

## Objetivo

Substituir stops percentuais fixos por níveis adaptados a volatilidade e risco máximo, sem alterar o alvo estrutural de 2,5R, e impedir que a aba Google Sheets seja apagada a cada webhook.

## Risco

Para cada oportunidade elegível, calcular:

`stopDistance = max(distância estrutural, ATR × multiplicador do perfil, spread + buffer de slippage)`.

`takeProfitDistance = 2.5 × stopDistance`.

`notional = min(notional por potência, risco máximo em USD / stopDistancePct)`.

Cada perfil declara multiplicador ATR, risco máximo por operação, spread máximo e risco agregado. A potência jamais pode ultrapassar o teto de risco. O motor bloqueia se o risco agregado de posições abertas mais o novo risco exceder o perfil global. R bruto e líquido (incluindo a taxa configurada) são registrados separadamente.

## Dados e segurança

ATR usa candles Bybit recentes. Dados ausentes, fallback local, ATR inválido ou livro vencido bloqueiam a entrada. A alteração permanece em paper trading até os testes e a auditoria Shadow serem aprovados.

## Google Sheets

Webhooks continuam gravando a linha imediatamente. O dashboard deixa de usar `clear()` e passa a atualizar apenas células de KPI e gráficos existentes. Um debounce de 60 segundos limita reconstruções de gráfico; múltiplos eventos dentro da janela são agregados. O dashboard exibe o horário da última atualização.

## Aceite

- Cada stop, alvo, risco bruto/líquido e tamanho possui motivo auditável.
- Nenhuma exposição ultrapassa o risco individual ou agregado configurado.
- A planilha não apaga a aba de painel por evento.
- O dashboard continua refletindo os novos dados após o debounce.
