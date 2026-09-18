# Relatório de Auditoria Diagnóstica — Mercado Financeiro (MarketFlow Pro)

**Data da Auditoria:** 17 de Setembro de 2026  
**Auditor Responsável:** Engenheiro Sênior de Software & QA Especialista em Mercado Financeiro, Algoritmos Quantitativos e Market Data  
**Modo de Execução:** Modo Leitura Estrito (*Read-Only*)  
**Módulo Avaliado:** `Mercado Financeiro` / `MarketFlow Pro` (`d:\Programas\Desenvolvendo\Mercado Financeiro`)  
**Repositório/Ecossistema:** Nexus Ecosystem (Membro de Análise Quantitativa, Tape Reading SMC e Execução Copy-Trading)

---

## 1. Resumo Executivo & Propósito do Módulo

O **MarketFlow Pro** é uma plataforma institucional SaaS para análise de microestrutura de mercado (Tape Reading), Smart Money Concepts (SMC), gestão quantitativa de risco e copy-trading automatizado via Bybit e simulador Paper Trading.

### Motores e Componentes Analisados:
1. **Market Data & Flow Engine (`marketDataManager.ts`, `flowEngine.ts`):**
   - Simulador de microestrutura de alta frequência (ticks a cada 100-300ms) com geração de OHLCV, CVD (Cumulative Volume Delta) e Book L2 (profundidade de 20 níveis para Bids e Asks).
   - Detecção em tempo real de **Agressão de Baleias** (trades $> \$50k$), **Absorções Passivas** de compra e venda e **Desbalanceamento de Liquidez (Imbalance Ratio)**.
2. **Motor de Estratégia Quantitativa (`quantStrategyEngine.ts`):**
   - Cálculo determinístico dos **6 Blocos de Saúde da Estratégia**:
     - *Financeiro:* Expectativa Matemática em R ($E = (W \times AW) - (L \times AL)$), Profit Factor, Payoff Ratio, Win Rate.
     - *Risco & Drawdown:* Drawdown máximo, trava de *Circuit Breaker* diário e por perda acumulada.
     - *Sequências & Regimes:* Sequências de perdas consecutivas, classificação por regime de mercado (Tendência vs Lateral).
     - *Distribuição:* Curtose, assimetria de retornos, distribuição de R.
     - *Segmentação Contextual:* Desempenho por par, por sessão (Ásia 00-08h, Londres 08-14h, Nova York 14-22h UTC) e dia da semana.
     - *Simulação de Monte Carlo:* 1.000 iterações com cálculo de probabilidade de ruína estatística.
3. **Mecanismo de Execução e Copy-Trading (`bybitExecutionEngine.ts`, `clientCopyTraderEngine.ts`):**
   - Dimensionamento de lote institucional com base em risco percentual fixo:
     $$\text{Notional USD} = \frac{\text{Balance} \times \text{Risk\%}}{\text{StopDist\%}}$$
   - Execução via biblioteca unificada `ccxt` (Bybit Linear Perpetuals com isolamento de credenciais criptografadas via AES-256-GCM).
4. **Shadow Mode Auditor (`shadowAuditor.ts`):**
   - Avaliação quantitativa não-bloqueante em segundo plano contra **USD Clumping / Correlação Direcional** e **Spread L2 Excessivo**.

---

## 2. Conectores de Market Data e APIs de Cotação

| Conector / Feed | Implementação | Delays / Taxa de Atualização | Normalização & Dados | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **Simulador de Alta Frequência (MarketDataManager)** | Interno no backend via loop de 200ms | Streaming contínuo WebSocket (Socket.IO) | Normaliza OHLCV (1m agregável até 1D), Trades com flag de baleia e Book L2 com cálculo de spread e profundidade total | 🟢 Operacional |
| **Bybit Linear Perpetuals (CCXT)** | `ccxt.bybit` v4.4.63 | Chamadas REST sob demanda com timeout seguro (3s em shadow audit) | Suporte a `fetchPositions`, `fetchTicker`, `createOrder` no formato `BTC/USDT:USDT` (sandbox e live) | 🟢 Operacional |
| **Scanner Autônomo de Pares (AutonomousPairScanner)** | Avaliação heurística periódica (2s) | Em tempo real via `recalculateAllPairs()` | Avalia spread (<0.08%), profundidade de livro e índice de order flow | 🟢 Operacional |

> [!NOTE]
> No momento, os feeds de cotação para o gráfico e terminal operam via simulador streaming em `marketDataManager.ts` (cripto e forex: BTC, ETH, SOL, EUR/USD, GBP/USD, USD/JPY, XAU/USD). A conectividade CCXT está concentrada no motor de execução, consulta de margem/posições e shadow audit.

---

## 3. Integração com IA e o Ecossistema Nexus

### 3.1 Conexão com o `nexus-cerebro`
- **Arquivo:** [`server/src/engine/aiAdvisorEngine.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/server/src/engine/aiAdvisorEngine.ts)
- **Modos de Operação:** `NEXUS_CEREBRO`, `GEMINI_AI`, ou `HYBRID_AUTO` (padrão configurado no `.env`).
- **Formato da Requisição:** Endpoint OpenAI-compatible: `POST ${NEXUS_CEREBRO_URL}/chat/completions` com header `Authorization: Bearer ${NEXUS_API_KEY}`.
- **Contexto Fornecido:** O sistema injeta dinamicamente o estado da conta, saldo, PnL, expectativa matemática em $R$, drawdown, win rate, resultado de Monte Carlo e par de melhor performance.
- **Fallback Heurístico:** Se o Cérebro e o Gemini estiverem inacessíveis, o motor gera um relatório determinístico quantitativo sem derrubar a API.

### 3.2 Conexão com o Hub de Comunicação (WhatsApp)
- **Arquivo:** [`server/src/services/comunicacaoService.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/server/src/services/comunicacaoService.ts)
- **Formato:** `POST ${COMUNICACAO_API_URL}/messages/send` com header `x-api-key: ${API_SECRET_KEY}`.
- **Webhook de Retorno:** `POST /api/webhooks/whatsapp` em [`server/src/index.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/server/src/index.ts#L103) para confirmação de leitura e validação anti-spam de números de clientes.

---

## 4. Persistência e Variáveis de Ambiente

### 4.1 Mecanismo de Banco de Dados
- **Driver:** PostgreSQL via `pg.Pool` conectado ao Railway PostgreSQL (`DATABASE_URL`).
- **Tabelas Gerenciadas:**
  - `app_users`: Usuários, papéis (`ADMIN`, `CLIENT`), senhas com bcrypt (custo 12) e validação WhatsApp.
  - `client_configs`: Credenciais Bybit encriptadas com AES-256 (`bybit_api_key_enc`, `bybit_api_secret_enc`), limites de drawdown e lotes.
  - `trade_history`: Histórico completo de trades com PnL, lado, notional, alavancagem e order IDs da Bybit.
  - `password_reset_otps`: Tokens temporários de recuperação de conta.
  - `announcements`: Mural de avisos do sistema.
- **Resiliência:** Tratamento de SSL automático (desabilitado para `railway.internal`, ativo para conexões externas via `rejectUnauthorized: false`).

### 4.2 Auditoria de Variáveis de Ambiente (`process.env`) vs `.env`

| Variável | No `.env` | No Código | Finalidade & Observação |
| :--- | :---: | :---: | :--- |
| `PORT` | ✅ (`4000`) | `server/src/index.ts` | Porta de escuta do servidor Express/Socket.IO |
| `NODE_ENV` | ✅ (`production`) | Múltiplos | Modo de execução |
| `JWT_SECRET` | ✅ | `server/src/auth/authMiddleware.ts` | Assinatura e validação dos tokens JWT |
| `MASTER_ENCRYPTION_KEY`| ✅ | `server/src/utils/crypto.ts` | Chave simétrica AES-256 para chaves Bybit |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | ✅ | `server/src/database/db.ts` | Credenciais iniciais do administrador master |
| `DATABASE_URL` | ✅ | `server/src/database/db.ts` | URI de conexão ao PostgreSQL |
| `AI_PROVIDER` | ✅ (`nexus`) | `server/src/index.ts` | Define o provedor de IA prioritário |
| `NEXUS_API_KEY` | ✅ | `server/src/engine/aiAdvisorEngine.ts` | Chave de autenticação no Cérebro |
| `NEXUS_BASE_URL` | ✅ | `server/src/engine/aiAdvisorEngine.ts` | Base URL do Cérebro (`/v1`) |
| `NEXUS_CEREBRO_URL` | ⚠️ Omitido | `server/src/engine/aiAdvisorEngine.ts` | Código usa `NEXUS_CEREBRO_URL` com fallback |
| `GEMINI_API_KEY` | ✅ | `server/src/engine/aiAdvisorEngine.ts` | Chave Google Gemini 3.7 Flash |
| `API_SECRET_KEY` | ✅ | `server/src/services/comunicacaoService.ts` | Chave de autenticação no Comunicacao Hub |
| `COMUNICACAO_API_URL` | ✅ | `server/src/services/comunicacaoService.ts` | URL base do Hub de Comunicação |
| `ALLOWED_ORIGINS` | Comentado | `server/src/index.ts` | Configuração de CORS para frontend externo |

> [!WARNING]
> O arquivo `.env.example` não está presente na raiz deste projeto. É fundamental criá-lo como documentação de referência para novos ambientes.

---

## 5. Checagem Estática, Compilação e Testes

### 5.1 Teste de Execução do Servidor (`npx tsx server/src/index.ts`)
- O backend inicializa de forma imediata e limpa:
  - Conexão e sincronização das tabelas PostgreSQL com sucesso.
  - Gateway WebSocket ativado em `ws://0.0.0.0:4000`.
  - HTTP Server rodando na porta 4000 com middlewares de proteção (Helmet, Rate Limiter) ativos.

### 5.2 Teste do Shadow Auditor (`test_shadow_audit.js`)
- Executado via `npx tsx test_shadow_audit.js`:
  - ✅ **Teste 1:** Bloqueio correto por excesso de exposição em USD (3.0R > 2.0R) e spread excessivo.
  - ✅ **Teste 2:** Permissão correta de trade EUR/USD com confluência aprovada.
  - ✅ **Teste 3:** Tratamento resiliente e não-bloqueante para book temporariamente vazio.

### 5.3 Checagem de Tipagem TypeScript (`tsc --noEmit`)
O projeto roda perfeitamente em runtime via `tsx`, porém o `tsc --noEmit` direto aponta divergências de configuração entre o backend e a pasta `shared/`:
1. **Extensões de Arquivo em ESM:**
   - O `server/tsconfig.json` está configurado com `"moduleResolution": "NodeNext"`, o que faz o compilador estrito do TypeScript exigir extensões explícitas `.js` nos imports relativos (ex: `from './pairPerformanceTracker.js'`).
2. **Localização de Arquivos Compartilhados:**
   - O `server/src/index.ts` importa tipos de `../../shared/`, enquanto o `server/tsconfig.json` possui `"rootDir": "./src"`. Em compilação estrita `tsc`, o `rootDir` exige que todos os arquivos fontes fiquem sob `server/src`. Em runtime via `tsx`, isso é resolvido transparentemente.
3. **Propriedade `plan_active` em `authRoutes.ts`:**
   - A interface `UserRow` em `db.ts` não inclui `plan_active` (que fica em `ClientConfigRow`), gerando um erro de tipagem estática no TypeScript (embora a query SQL funcione).

---

## 6. Matriz de Riscos e Recomendações

| Item | Nível de Risco | Descrição | Impacto |
| :--- | :---: | :--- | :--- |
| **Ausência de `.env.example`** | 🟢 Baixo | Não há arquivo de exemplo na raiz. | Dificulta onboarding de novos desenvolvedores. |
| **Ajuste de Variável Cérebro** | 🟡 Baixo | `.env` define `NEXUS_BASE_URL`, mas `aiAdvisorEngine.ts` lê `NEXUS_CEREBRO_URL`. | Atualmente mitigado pelo fallback com a URL oficial do Railway, mas deve ser padronizado. |
| **Configuração de `tsconfig.json`** | 🟡 Moderado | Divergência entre `moduleResolution: NodeNext` e imports sem extensão `.js`. | Impede build estrito via `tsc`, exigindo execução via `tsx` (que já é o padrão configurado em `package.json`). |
| **Feed de Cotações 100% Simulado no Frontend** | 🟡 Moderado | O gráfico do terminal utiliza o simulador de alta frequência em vez de cotações reais da Bybit/Binance. | Excelente para demonstração e paper trading com alta velocidade, mas se o objetivo for dados reais em tela, precisará de WebSocket CCXT conectado aos feeds da Bybit. |

---

## 7. Plano de Correção e Mitigação Seguro

1. **Criação do `.env.example`:**
   - Disponibilizar template limpo com as variáveis necessárias (`PORT`, `DATABASE_URL`, `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `NEXUS_CEREBRO_URL`, `COMUNICACAO_API_URL`, etc.).
2. **Alinhamento de Variável de Ambiente para o Cérebro:**
   - Em `server/src/engine/aiAdvisorEngine.ts`, ler tanto `process.env.NEXUS_CEREBRO_URL` quanto `process.env.NEXUS_BASE_URL`.
3. **Harmonização do TypeScript:**
   - Ajustar o `server/tsconfig.json` para `"moduleResolution": "bundler"` (ou adicionar `shared` no escopo do tsconfig de topo), eliminando os alertas de compilação estrita sem afetar o runtime.
4. **Exposição de Rota de Membro Nexus (Opcional):**
   - Criar rota `/api/nexus/ferramentas` no MarketFlow Pro para permitir que o `nexus-cerebro` execute comandos de consulta de mercado e acione o robô autônomo diretamente como ferramenta.

---

## 8. Conclusão Diagnóstica

O módulo **Mercado Financeiro (MarketFlow Pro)** apresenta **excelente qualidade arquitetural em suas engines quantitativas e financeiras**. O modelo de avaliação em 6 Blocos de Saúde, a simulação estatística de Monte Carlo e a gestão de risco anti-USD Clumping no Shadow Auditor são robustos e operacionais. O servidor inicializa com sucesso no PostgreSQL e comunica-se perfeitamente com o ecossistema Nexus (`nexus-cerebro` e `Comunicacao Hub`).
