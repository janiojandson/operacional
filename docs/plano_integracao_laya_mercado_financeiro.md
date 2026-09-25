# 🧠 Plano de Arquitetura & Integração: Laya (Sistema 1) no Mercado Financeiro

> **Módulo:** Mercado Financeiro (`operacional:4000`) & Laya (`nexus-decisor-laya:8000`)  
> **Status:** Proposta de Integração Dinâmica (Protocolo Safe-Dev)  
> **Objetivo:** Desengessar o motor de execução substituindo timers e travas mecânicas por **Arbitragem Contextual Instantânea (< 15ms)** via Laya.

---

## 🎯 1. DIAGNÓSTICO DO GARGALO ATUAL (ENGESSAMENTO MECÂNICO)

Hoje, o motor de trading do Mercado Financeiro possui travas estáticas que, embora protejam a banca, introduzem ineficiências operacionais críticas:

| Trava Atual | Comportamento Rígido | Efeito Colateral Negativo |
|---|---|---|
| **Cooldown Pós-Trade** | Timer fixo de **15 minutos** cravados após qualquer saída. | Fica de fora de reversões institucionais perfeitas que ocorrem no minuto 3 ou 5 após um stop hunt. |
| **Potência da IA** | Multiplicador restrito entre **1.5x e 3.0x** via cálculo estático. | Não expande agressivamente para 4.0x, 5.0x ou 6.0x em momentos raros de alinhamento cósmico (Super Whale + Vácuo de Livro). |
| **Stop Loss** | Percentual fixo por moeda (ex: 0.8% BTC, 1.4% SOL). | Ignora muros institucionais próximos (ex: Iceberg visível a 0.4%), desperdiçando assimetria de Payoff. |
| **Filtro de Regime** | Bloqueio binário se `CHOPPY_RANGING`. | Perde o momento exato de transição em que um range lateral rompe com agressão institucional massiva. |

---

## ⚡ 2. A SOLUÇÃO: ARBITRAGEM INSTANTÂNEA DA LAYA (SISTEMA 1)

Como a **Laya** roda na mesma rede interna do Railway (`nexus-decisor-laya.railway.internal:8000`), o ping de rede interna é de **< 5ms** com **R$ 0,00 de custo de tokens** (algoritmos rápidos e heurísticas reflexivas).

### O Fluxo de Comunicação Bidirecional:
```
[Mercado Financeiro :4000]                                     [Laya Decisor :8000]
           │                                                              │
           │── 1. POST /v1/systemone/market-governance ──────────────────►│
           │      Payload: {                                              │ (Avaliação em < 10ms:
           │        symbol, currentPrice,                                 │  - Cooldown ainda faz sentido?
           │        bookImbalance, dominantAggression,                    │  - Houve Sweep/Rompimento?
           │        lastExitMsAgo, regime,                                │  - Potência ideal: 1.5x a 6x?
           │        proposedStopLoss, proposedTakeProfit                  │  - Stop Loss ótimo atrás de cluster)
           │      }                                                       │
           │                                                              │
           │◄─ 2. Veredito Contextual Instantâneo ────────────────────────│
           │      {                                                       │
           │        decision: "APPROVED" | "VETO",                        │
           │        overrideCooldown: true | false,                       │
           │        adaptedPower: 4.5,                                    │
           │        dynamicStopPrice: 83450.00,                           │
           │        confidenceReason: "SWEEP_CONFIRMED_WHALE_BURST"       │
           │      }                                                       │
           ▼                                                              ▼
Executa Ordem Dinâmica com                                   Log Estratégico Registrado
Máxima Assimetria no Livro                                   no Banco e no Google Sheets
```

---

## 🧩 3. OS 4 PILARES DE AVALIAÇÃO DA LAYA

### Pilar I: O "Perdão Condicional" de Cooldown (Desengessamento dos 15m)
* **Regra Rígida:** Se `agora - última_saída < 15 min`, bloqueia.
* **Avaliação da Laya:**
  * Se o preço continua oscilando sem volume dentro da vela do stop anterior $\rightarrow$ **Mantém Cooldown** (*"Ruído de consolidação detectado"*).
  * Se o par sofreu um *Liquidity Sweep* (violou o fundo anterior e fechou acima em V com delta comprador > 3x) $\rightarrow$ **Concede Override** (*"Limpeza institucional confirmada. Entrada autorizada em 4 minutos pós-stop"*).

### Pilar II: Arbitragem Térmica de Potência (1.5x a 6.0x+)
A Laya avalia a confluência e classifica em 4 degraus instantâneos:
1. **1.5x (Defesa Ativa):** Sinal técnico com divergência leve de volume ou mercado morno.
2. **2.5x - 3.0x (Tração Padrão):** Livro L2 com imbalance > 2.8x e fluxo comprador coerente.
3. **4.0x - 5.0x (Expansão Institucional):** Presença de baleias (> $100k) + rompimento de topo do dia.
4. **6.0x+ (Evento de Deus / Confluência Rara):** Vácuo total de liquidez no book vendedor (gap de liquidez) + agressão massiva na mesma direção.

### Pilar III: Micro-Posicionamento do Stop Loss (Maximização de Payoff)
* Em vez de colocar o Stop a 0.8% no vazio:
* A Laya recebe os 20 níveis do Order Book L2 e localiza o **cluster de maior densidade passiva**:
  * Exemplo: Grande bloco de ordens de suporte em 0.35% de distância.
  * A Laya instrui o motor a colocar o Stop Loss em 0.40% (protegido pelo bloco institucional).
  * **Consequência:** Com o stop reduzido pela metade, o alvo de 2.0% deixa de ser 2.5R e se torna **5.0R**, dobrando o retorno matemático do trade com o mesmo risco em dólar!

### Pilar IV: Gestão Dinâmica do Runner Mode
* Quando o trade atinge o alvo integral (2.5R) e vira Runner:
* O motor consulta a Laya a cada tick relevante:
  * Se a Laya detecta **exaustão de fluxo no topo (Absorção passiva)** $\rightarrow$ Recomenda encerramento imediato ou trailing colado.
  * Se a Laya detecta **continuidade institucional sem resistência** $\rightarrow$ Recomenda esticar o trade para buscar 4R a 8R.

---

## 📋 4. ETAPAS DE IMPLEMENTAÇÃO TÉCNICA (NEXUS SAFE-DEV)

1. **Fase 1 — Contrato de Rota na Laya (`nexus-decisor-laya:8000`):**
   * Criar endpoint leve em FastAPI/Node: `POST /v1/systemone/market-governance`.
   * Algoritmo puramente matemático e baseado em heurísticas (execução < 5ms).
2. **Fase 2 — Cliente de Governança no Mercado Financeiro:**
   * Criar `server/src/services/layaGovernanceService.ts` com timeout estrito de 25ms e fallback graceful (se a Laya demorar, segue com as regras padrão sem travar o motor).
3. **Fase 3 — Painel e Telemetria no Terminal Web:**
   * Badge no dashboard: `Laya Shield: ATIVO (Supervisão Contextual)`.
   * Log visual no terminal informando quando a Laya conceder perdão de cooldown ou elevar a potência.
