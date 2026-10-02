# AGENTE: Mercado Financeiro (MarketFlow Pro)
**Módulo:** Mercado Financeiro
**Versão do Agente:** 2.3.0
**Porta do Serviço:** 4000 (`operacional-production-57d9.up.railway.app`)
**Sistema 1 advisory:** Laya upstream ✅ (endpoint obrigatório via `MARKET_LAYA_NATIVE_URL`; sem fallback hardcoded)

---

## 🎯 1. MISSÃO E ESCOPO

- **Objetivo Primário:** Motor de Trading Quantitativo, análise de fluxo institucional (Order Flow, Whales, Imbalance, Absorção) conectado à Bybit e execução em Modo Sombra (*Shadow Mode*) com sincronização em Google Sheets.
- **Porta Oficial Estrita:** Porta `4000` (bind `0.0.0.0` com fallback para `process.env.PORT`).
- **Limites de Contenção:** Proibido invadir portas 3000-3003, 8000 ou 8080. Nunca reescrever mais de 40 linhas sem validação prévia — apenas diffs cirúrgicos.

---

## 🏗️ 2. ARQUITETURA DE 4 CAMADAS (Universal: Terminal, OpenCode, Telegram)

```
Entrada (Terminal CLI | OpenCode | Webhook Trading | Cron Bybit)
  → CAMADA 1 — GOVERNANÇA DETERMINÍSTICA DO MERCADO [✅ AUTORIDADE FINANCEIRA]
      Regras de spread, risco, stop, cooldown, lifecycle, scale-in, circuit breaker e modo de execução.
  → CAMADA 1B — LAYA UPSTREAM (Sistema 1) [✅ SHADOW/ADVISORY]
      Triagem tipada choice/score/noul com answer_confidence. Nunca autoriza ordem, tamanho, stop, fechamento ou execução.
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
    `DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/railway`
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

#### REGRAS DE ARQUITETURA VISUAL E DESACOPLAMENTO DE DASHBOARDS (POSTGRESQL + LOOKER STUDIO):
1. Sempre que a demanda envolver a criação de dashboards, painéis de auditoria, relatórios gerenciais ou cálculos de métricas sobre dados operacionais já armazenados no Event Store (PostgreSQL do Railway), a IA NÃO deve criar lógicas de apresentação, requisições HTTP secundárias (webhooks) ou integrações via código para planilhas como o Google Sheets.
2. A aplicação (backend) deve manter a responsabilidade única de registrar os dados brutos em alta velocidade (fire-and-forget), preservando a latência exigida (sub-25ms) e o rate limit das rotas críticas.
3. Para visualização de métricas e comparativos, a IA deve sugerir apenas a criação de Views SQL estruturadas no PostgreSQL e orientar a conexão direta, gratuita e passiva do Google Looker Studio à URL Pública do banco.

---

## 🔌 5. TABELA OFICIAL DE PORTAS

## 🔌 5. TABELA OFICIAL DE PORTAS E MALHA PRIVADA RAILWAY (Topologia Homologada)

Toda a comunicação com a malha interna do Railway opera com sub-20ms e custo zero de tráfego:

| Serviço | Porta | Domínio Interno Railway | Domínio Público / Local |
|---|---|---|---|
| **nexus-cerebro** | **3000** | `nexus-cerebro.railway.internal:3000` | `nexus-cerebro-production-a7c0.up.railway.app` |
| **nexus-membro-github** | **3001** | `tranquil-eagerness.railway.internal:3001` | Interno |
| **nexus-membro-sistema** | **3002** | `nexus-membro-sistema.railway.internal:3002` | Interno |
| **nexus-membro-memoria** | **3003** | `nexus-membro-memoria.railway.internal:3003` | Interno |
| **Mercado Financeiro** | **4000** | `operacional.railway.internal:4000` | `operacional-production-57d9.up.railway.app` |
| **Postgres Principal** | **5432** | `postgres.railway.internal:5432` | Proxy TCP externo 25561 |
| **Laya upstream canônica** | dinâmica | `MARKET_LAYA_NATIVE_URL` | Configurada por ambiente; nunca contém regras do Mercado |
| **nexus-omniroute** | **8080** | `nexus-omniroute.railway.internal:8080` | `nexus-omniroute-production.up.railway.app` |

---

## 🛠️ 6. GOVERNANÇA DE INFRAESTRUTURA RAILWAY (MODO SENSOR & TELEMETRIA)
1. **Segredos Protegidos em Variáveis de Ambiente (.env):**
   - As variáveis `RAILWAY_PROJECT_ID` e `RAILWAY_TOKEN` ficam restritas ao `.env` do container/serviço para localização do projeto `nexus-multi` e consulta de logs/telemetria.
2. **Auto-Cura Exclusiva do Cérebro (Proibição de Restart Autônomo):**
   - O Mercado Financeiro é um ambiente financeiro crítico e **NÃO deve executar auto-cura ou reinicializações autônomas de infraestrutura**.
   - Em caso de falha da Laya advisory, o módulo registra a anomalia e mantém a decisão financeira exclusivamente no motor determinístico local; a falha nunca vira autorização implícita, nem impede ações explícitas de proteção.

---
*Padrão unificado Nexus v2.3 — Fonte da verdade: `Documento_Mestre_Projeto_SaaS`.*
