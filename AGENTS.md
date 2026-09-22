# REGRAS OBRIGATÓRIAS DE DESENVOLVIMENTO (NEXUS ARCHITECTURE)

1. REESCRITA PROIBIDA: Nunca reescreva arquivos completos com mais de 40 linhas. Aplique estritamente diffs cirúrgicos ou funções isoladas.
2. CONTRATOS DE REDE: Mantenha a porta oficial 4000 (bind 0.0.0.0 com fallback para process.env.PORT). NUNCA invada as portas 20128, 5173 ou 3000-3003.
3. CONTRATOS DE API: Nunca modifique a assinatura de rotas existentes (ex: /api/assets/:symbol/klines?tf=) ou os schemas consumidos pelo lightweight-charts.
4. DEPENDÊNCIAS: Proibido adicionar ou remover pacotes no package.json sem aprovação prévia da arquitetura.
5. FLUXO OBRIGATÓRIO: Qualquer intervenção deve seguir as tags /safe-dev [DIAGNÓSTICO], [EXECUÇÃO CIRÚRGICA] e [VERIFICAÇÃO DE REGRESSÃO].
6. CHECKLIST FINAL DE VALIDAÇÃO VISUAL (OPERADOR HUMANO)

Com a API e o backend homologados a 100%, execute os 3 passos visuais na interface [https://operacional-production-57d9.up.railway.app/](https://operacional-production-57d9.up.railway.app/):

- **Alternância de Timeframe:** Alterne entre 1h, 4h e 1D e verifique a continuidade dos 400 candles históricos sem gaps anômalos.
- **Gatilhos de Fluxo:** Ligue o botão "Gatilhos de Fluxo" e confirme a plotagem das setas de agressão (WHALE, ABSORPTION, BOOK_IMBALANCE) nos topos e fundos em até 30 segundos.
- **Tick do Candle Atual:** Observe a ponta do gráfico e comprove que o preço e o volume do candle de 1m oscilam a cada ~2 segundos, refletindo o fluxo ao vivo da Bybit sem travamento de tela.

Após a rotação dos tokens e a validação visual, o ciclo de implantação e correção crítica do MarketFlow Pro estará concluído com estabilidade produtiva.
