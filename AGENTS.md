# AGENTE: Mercado Financeiro (MarketFlow Pro)
**Módulo:** Mercado Financeiro
**Versão do Agente:** 2.3.0
**Porta do Serviço:** 4000 (`operacional-production-57d9.up.railway.app`)
**Decisor de Sistema 1:** Laya ✅ (`http://nexus-decisor-laya.railway.internal:8000/v1/systemone`)

---

## 🎯 1. MISSÃO E ESCOPO

- **Objetivo Primário:** Motor de Trading Quantitativo, análise de fluxo institucional (Order Flow, Whales, Imbalance, Absorção) conectado à Bybit e execução em Modo Sombra (*Shadow Mode*) com sincronização em Google Sheets.
- **Porta Oficial Estrita:** Porta `4000` (bind `0.0.0.0` com fallback para `process.env.PORT`).
- **Limites de Contenção:** Proibido invadir portas 3000-3003, 8000 ou 8080. Nunca reescrever mais de 40 linhas sem validação prévia — apenas diffs cirúrgicos.

---

## 🏗️ 2. ARQUITETURA DE 4 CAMADAS (Universal: Terminal, OpenCode, Telegram)

```
Entrada (Terminal CLI | OpenCode | Webhook Trading | Cron Bybit)
  → CAMADA 1 — LAYA (Sistema 1)  [✅ ATIVA — <1s, R$0 de tokens]
      Triagem rápida: identifica operações financeiras (destino: mercado_financeiro), risco operacional e se precisa LLM.
  → CAMADA 2 — CÉREBRO (Orquestrador Sistema 2) [nexus-cerebro:3000]
      pensarEAgir + tool calling distribuído + despacho aos membros.
  → CAMADA 3 — OMNIROUTE (Maestro de Chaves & IA) [nexus-omniroute:8080]
      Rotas auto/* (best-coding, best-fast, best-free). 7 contas Antigravity + chaves com volume /app/data.
  → CAMADA 4 — PROVIDERS & EXECUÇÃO
      Gemini 2.5 Flash · Groq · OpenRouter · Modal GLM-5.1.
```

---

## 💰 3. REGRA DE OURO DE INFRAESTRUTURA & ECONOMIA (VOLUMES & BANCO)

- **Postgres Central Unificado (:5432):**
  - **O Mercado Financeiro já utiliza o Postgres Principal com sucesso absoluto**:
    `DATABASE_URL=postgresql://postgres:eyxuLapofrztxnKcfhRZVgBAajjfAuUY@postgres.railway.internal:5432/railway`
  - Tabelas operacionais ativas: `trade_history`, `shadow_positions`, `paper_master_account`, `paper_mirror_account`, etc.
  - **NÃO criar novos bancos ou containers**. O compartilhamento do banco principal economiza instâncias duplicadas de RAM e volumes no Railway.
- **Política de Volumes:**
  - O Mercado Financeiro é **Stateless** no filesystem (custo zero de volume no Railway), persistindo todo o histórico de candles, posições e ordens diretamente nas tabelas do Postgres principal.

---

## 🛡️ 4. REGRAS OBRIGATÓRIAS DE DESENVOLVIMENTO (NEXUS SAFE-DEV)

1. **REESCRITA PROIBIDA:** Nunca reescreva arquivos completos com mais de 40 linhas. Aplique estritamente diffs cirúrgicos ou funções isoladas.
2. **CONTRATOS DE REDE:** Mantenha a porta oficial 4000. NUNCA invada as portas 3000-3003, 8000 ou 8080.
3. **CONTRATOS DE API:** Nunca modifique a assinatura de rotas existentes (ex: `/api/assets/:symbol/klines?tf=`) ou os schemas consumidos pelo lightweight-charts.
4. **DEPENDÊNCIAS:** Proibido adicionar ou remover pacotes no `package.json` sem aprovação prévia.
5. **CHECKLIST DE VALIDAÇÃO VISUAL (OPERADOR):**
   - **Alternância de Timeframe:** Alterne entre 1h, 4h e 1D e verifique a continuidade dos 400 candles históricos sem gaps anômalos.
   - **Gatilhos de Fluxo:** Ligue o botão "Gatilhos de Fluxo" e confirme a plotagem das setas de agressão (`WHALE`, `ABSORPTION`, `BOOK_IMBALANCE`) nos topos e fundos em até 30 segundos.
   - **Tick do Candle Atual:** Observe a ponta do gráfico e comprove que o preço e o volume do candle de 1m oscilam a cada ~2 segundos, refletindo o fluxo ao vivo da Bybit sem travamento de tela.

---

## 🔌 5. TABELA OFICIAL DE PORTAS

| Serviço | Porta | Domínio Interno Railway | Domínio Público / Local |
|---|---|---|---|
| **nexus-cerebro** | **3000** | `nexus-cerebro.railway.internal:3000` | `nexus-cerebro-production-a7c0.up.railway.app` |
| **nexus-membro-github** | **3001** | `tranquil-eagerness.railway.internal:3001` | Interno |
| **nexus-membro-sistema** | **3002** | `nexus-membro-sistema.railway.internal:3002` | Interno |
| **nexus-membro-memoria** | **3003** | `nexus-membro-memoria.railway.internal:3003` | Interno |
| **Mercado Financeiro** | **4000** | `operacional.railway.internal:4000` | `operacional-production-57d9.up.railway.app` |
| **Postgres Principal** | **5432** | `postgres.railway.internal:5432` | Proxy TCP externo 25561 |
| **nexus-decisor-laya** | **8000** | `nexus-decisor-laya.railway.internal:8000` | `nexus-decisor-laya-production.up.railway.app` |
| **nexus-omniroute** | **8080** | `nexus-omniroute.railway.internal:8080` | `nexus-omniroute-production.up.railway.app` |

---
*Padrão unificado Nexus v2.3 — Fonte da verdade: `Documento_Mestre_Projeto_SaaS`.*
