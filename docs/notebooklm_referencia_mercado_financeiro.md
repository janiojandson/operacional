# Documento de Contexto Geral e Técnico — Mercado Financeiro (MarketFlow Pro) & Laya Decisor
> **Destinado para Alimentação de Base de Conhecimento no Google NotebookLM**  
> **Data de Atualização:** 26 de Setembro de 2026  
> **Repositório GitHub:** `github.com/janiojandson/operacional` (Branch: `main`)  
> **Deploy:** Railway (`Mercado Financeiro` / `operacional-production-57d9.up.railway.app`)

---

## 1. Visão Geral da Arquitetura do Sistema

O ecossistema é composto por múltiplos serviços integrados de alta performance para trading automatizado institucional, tape reading SMC (Smart Money Concepts) e governança algorítmica:

1. **Mercado Financeiro (MarketFlow Pro / Operacional):**
   - **Stack:** Node.js, TypeScript, Express, Socket.IO, PostgreSQL, CCXT (Bybit Linear Perpetuals / BingX).
   - **Porta / Host:** `:4000` / Deploy no Railway (`operacional-production-57d9.up.railway.app`).
   - **Responsabilidades:** Motor de cotação streaming, Book L2 de 20 níveis, detecção de baleias (trades > $50k), desbalanceamento de fluxo (Imbalance), Cumulative Volume Delta (CVD), execução de ordens, gerenciamento de posições e espelhamento de dados.

2. **Laya / Ayla (Sistema 1 - Decisor Reflexivo de Ultrabaixa Latência):**
   - **Stack:** Python/FastAPI ou microsserviço de heurística matemática ultrarrápida.
   - **Porta / Host:** `:8000` / Rede interna Railway (`nexus-decisor-laya.railway.internal:8000`).
   - **Missão:** Arbitragem contextual de mercado em tempo real (< 15ms), sem custos de LLM por tick. Realiza pré-qualificação de setups, perdão condicional de cooldown pós-stop, modulação de potência da estratégia (1.5x a 6.0x) e proteção contra ruído de mercado.

3. **Google Sheets (Dashboard Institucional de Auditoria & Painel de Controle):**
   - **Versão do Apps Script:** v4.3 consolidado em `google_sheets_apps_script_current.js`.
   - **Abas principais:**
     - `Configurações`: Parâmetros de risco, chaves e controles operacionais.
     - `Auditoria Ayla (Decisões)`: Log detalhado de cada análise e decisão institucional emitida pela Laya/Ayla.
     - `Histórico de Trades`: Registros de posições executadas com PnL, alavancagem e drawdown.
   - **Mecanismo de Reset / Zeramento:** Botão e função dedicada `zerarHistoricoAyla()` / `zerarDecisoesAyla()` vinculados à interface para expurgo do log de decisões sem interferir nas configurações ou fórmulas da planilha.

---

## 2. Diagnóstico Recente: Gargalos de Latência e Sobrecarga da Laya

Durante a auditoria operacional de setembro de 2026, identificaram-se anomalias críticas no comportamento da Laya:

### Problemas Detectados:
1. **Bombardeio Contínuo de Diretrizes (Cascata Ininterrupta):**
   - A Laya recebia chamadas sequenciais desnecessárias a cada variação mínima de preço/tick do WebSocket.
   - Isso gerava centenas de decisões repetitivas com o mesmo racional institucional, inundando a aba `Auditoria Ayla (Decisões)` no Google Sheets.
2. **Aumento de Latência e Timeouts:**
   - Com o congestionamento de requisições concorrentes, as chamadas ultrapassavam o limiar de resposta, resultando em status recorrente de `TIMEOUT_FAIL_CLOSED` (resposta defensiva padrão do sistema).
3. **Sobrecarga na Planilha e no Banco de Dados:**
   - O volume massivo de linhas criadas a cada minuto reduzia a performance do Google Sheets e gerava atrasos de renderização no terminal.

---

## 3. Correções Estruturais e Otimizações Aplicadas (Setembro/2026)

Para garantir operação autônoma, saudável e ininterrupta 24 horas por dia (24/7), foram implementadas as seguintes soluções no código-fonte e no ambiente de produção:

### 3.1. Debounce e Intervalo Mínimo de Decisão
- **Regra:** Implementado throttle/debounce temporal de **8 segundos** (`LAYA_DEBOUNCE_MS=8000`) por par de moedas.
- **Resultado:** A Laya não processa chamadas redundantes para o mesmo par em intervalos microscópicos, reduzindo o tráfego em mais de 80% sem perder nenhum ponto de inflexão de mercado.

### 3.2. Pré-Qualificação de Setups (Filtro Anti-Ruído)
- **Regra:** O motor do Mercado Financeiro só despacha requisições para a Laya se houver um desbalanceamento mínimo comprovado no Livro de Ordens (`LAYA_MIN_IMBALANCE=1.25`).
- **Resultado:** Mercado lateral sem fluxo ou oscilações normais de spread não consomem processamento da Laya. Apenas setups com intenção institucional acionam o Sistema 1.

### 3.3. Timeout Ajustado e Fallback Seguro
- **Timeout Rígido:** Estabelecido em 800ms (`LAYA_TIMEOUT_MS=800`) para chamadas via rede interna Railway.
- **Fail-Safe:** Caso a rede oscile, o motor assume postura de proteção defensiva (Fail-Closed) sem travar o loop de cotações dos ativos.

### 3.4. Botão e Rotina de Zeramento na Planilha Google
- Implementado no arquivo `google_sheets_apps_script_current.js`:
  - Limpeza limpa da aba `Auditoria Ayla (Decisões)` preservando linha de cabeçalho e formatação visual.
  - Sincronização via webhook com o comando de zeramento disparado pelo terminal operacional.

---

## 4. Variáveis de Ambiente e Configurações no Railway

As variáveis de controle da governança Laya foram injetadas e ativadas no serviço `Mercado Financeiro` via Railway CLI:

| Variável | Valor Configurado | Descrição / Efeito Prático |
|---|---|---|
| `LAYA_MODE` | `ACTIVE` | Ativa a governança contextual da Laya sobre as ordens. |
| `LAYA_SERVICE_URL` | `http://nexus-decisor-laya.railway.internal:8000` | Rota privada de baixíssima latência na malha interna do Railway. |
| `LAYA_DEBOUNCE_MS` | `8000` | Intervalo mínimo de 8 segundos entre avaliações consecutivas do mesmo ativo. |
| `LAYA_TIMEOUT_MS` | `800` | Limite de espera síncrona antes do fallback defensivo. |
| `LAYA_MIN_IMBALANCE` | `1.25` | Filtro prévio: razão mínima entre ordens passivas de compra/venda para disparar consulta. |

---

## 5. Os 4 Pilares de Inteligência da Laya (Sistema 1)

1. **Perdão Condicional de Cooldown:**
   - Em vez de uma trava mecânica cega de 15 minutos pós-stop loss, a Laya identifica *Liquidity Sweeps* com reversão agressiva em V e autoriza reentradas imediatas em condições de alta assimetria.
2. **Modulação Dinâmica de Potência (1.5x a 6.0x):**
   - 1.5x: Sinal moderado com divergência técnica leve.
   - 2.5x a 3.0x: Fluxo institucional padrão confirmado no Order Book L2.
   - 4.0x a 5.0x: Presença de grandes players (> $100k) e rompimento estrutural.
   - 6.0x+: Vácuo de liquidez no book oposto acompanhado de agressão institucional maciça.
3. **Micro-Posicionamento do Stop Loss:**
   - Análise dos 20 níveis de profundidade para posicionar o Stop Loss imediatamente atrás de barreiras passivas (icebergs/clusters de liquidez), dobrando o Payoff $R$ do trade.
4. **Gestão de Posições Vencedoras (Runner Mode):**
   - Acompanhamento tick a tick para identificar absorção de topo (exaustão de fluxo) para saída cirúrgica ou expansão do alvo para capturar 4R a 8R.

---

## 6. Roteiro de Verificação e Saúde Operacional 24/7

1. **Logs do Railway:** Monitorar logs de execução procurando por:
   - Respostas de veredito da Laya com latência inferior a 15ms.
   - Ausência de loops e supressão de mensagens repetitivas de `TIMEOUT_FAIL_CLOSED`.
2. **Terminal Web & Dashboard:**
   - Indicador de status da Laya ativo e responsivo.
   - Tabela de decisões atualizada com espaçamento ordenado e racional analítico condizente com a volatilidade do momento.
3. **Planilha Google:**
   - Uso regular da função de zeramento de histórico para manutenção da fluidez das planilhas em longos períodos de operação.
