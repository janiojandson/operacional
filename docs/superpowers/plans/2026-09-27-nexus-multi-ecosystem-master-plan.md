# 🏛️ PLANO DIRETOR ECOSSISTEMA NEXUS MULTI: ARQUITETURA GLOBAL & CURADORIA DE OPORTUNIDADES

> **Documento Estratégico e de Engenharia de Software da Holding Nexus**  
> *Versão:* 2.0.0 Global | *Classificação:* Arquitetura Central, Topologia e Roteiro de Inovação  
> *Skill de Referência:* `writing-plans` e Governança `AGENTS.md`

---

## 🎯 1. VISÃO HOLÍSTICA: O QUE É O NEXUS MULTI?

O **Nexus Multi** é uma holding tecnológica autônoma constituída por agentes de software, motores quantitativos, ferramentas de captação de leads e produtos SaaS. 

**Princípio Fundamental:** Nenhum serviço deve existir como uma ilha isolada. Todas as ferramentas de ponta open-source integradas devem operar como **Serviços Compartilhados (Shared Micro-Hubs)** na malha interna privada do Railway (`.railway.internal`), servindo múltiplos projetos com latência sub-10ms e custo de tráfego zero.

---

## 🗺️ 2. TOPOLOGIA GLOBAL DE PORTAS & MALHA PRIVADA RAILWAY

| Serviço / Hub Central | Porta | Domínio Interno Railway | Função Primária | Projetos Beneficiados |
|---|---|---|---|---|
| **PostgreSQL Central** | **5432** | `postgres.railway.internal:5432` | Banco Relacional & Event Store | TODOS os Projetos |
| **nexus-decisor-laya** | **8080** | `nexus-decisor-laya.railway.internal:8080` | Sistema 1 (Triagem <1s, R$0) | Cérebro, Mercado, Solana |
| **nexus-cerebro** | **3000** | `nexus-cerebro.railway.internal:3000` | Sistema 2 (Orquestrador/Missões) | Sócio (Janio) & Holding |
| **nexus-social-hub** *(Novo)* | **3008** | `nexus-social-hub.railway.internal:3008` | Gateway X (Twitter) & Telegram | Solana, Mercado, Licitações |
| **nexus-quant-solana** | **3009** | `nexus-quant-solana.railway.internal:3009` | Agente Soberano On-Chain 24/7 | Solana & Carteira Phantom |
| **Mercado Financeiro** | **4000** | `operacional.railway.internal:4000` | MarketFlow Pro (BingX/Bybit) | Mesa Quantitativa |
| **nexus-macro-sentinel** *(Novo)* | **4005** | `nexus-macro.railway.internal:4005` | Macro Regime (TradingAgents/OpenBB)| Solana & Mercado Financeiro |
| **nexus-data-harvest** *(Novo)* | **3005** | `nexus-harvest.railway.internal:3005` | Motor de Extração (Gosom/APIs) | Buscador, Licitações, Cérebro |
| **nexus-membro-sistema** | **3002** | `nexus-membro-sistema.railway.internal:3002` | Execução CLI / Segurança | Cérebro |
| **nexus-membro-memoria** | **3003** | `nexus-membro-memoria.railway.internal:3003` | Vetorial & Obsidian | Memória Persistente |
| **Licitações** | **3004** | `licitacoes.railway.internal:3004` | SaaS LicitaRadar | Fornecedores do Governo |
| **Buscador** | **3007** | `buscador.railway.internal:3007` | Inteligência B2B & Prospecção | Vendas & Prospecção |

---

## 🔬 3. AUDITORIA PROFUNDA DA LISTA DO INSTAGRAM: SEPARAÇÃO DE OURO VS LIXO

Abaixo está o mapeamento técnico exato de cada ferramenta do Reel do Instagram, sua classificação de valor real e como ela é incorporada no Nexus Multi:

### 🧠 Categoria 1: Agentes de IA & Algotrading Institucional

| Ferramenta / Projeto | Repositório | Classificação | O que faz & Como serve ao Nexus Multi |
|---|---|---|---|
| **TradingAgents** | `Tauric/TradingAgents` | 💎 **OURO PURO** | Simula mesa com analista técnico, macro, sentinela e gestor de risco. **No Nexus Multi:** Vira o `nexus-macro-sentinel` (:4005). Alimenta tanto o **Mercado Financeiro** quanto o **Solana**, ditando o regime de mercado (RISK_ON vs RISK_OFF). |
| **Mirror Fish** | `Mirror Fish` | ⚖️ **CONCEITO / INCUBAR** | Simulação de mercado com 4.096 agentes para prever reações coletivas. **No Nexus Multi:** Útil no futuro para validar apostas preditivas (Polymarket) e liquidez de memecoins virais. |
| **Autonomous Self-Funding Agent** | Open Source | 💎 **OURO PURO** | Agente com carteira cripto, 3 leis e degradação de modelo conforme saldo. **No Nexus Multi:** **JÁ IMPLEMENTADO NATIVAMENTE** no `nexus-quant-solana` através do nosso `vitalityEngine` (DEAD, SPARTAN, NORMAL, PROSPERITY) e do pacto darwinista 50/50. |
| **DeepSeek Harness** | `deepseek-harness` | 💎 **OURO PURO** | Alternância dinâmica de modelo, memória e loop de raciocínio. **No Nexus Multi:** Integrado no OmniRoute e na Laya para baratear chamadas de LLM trocando dinamicamente entre modelos rápidos e profundos. |
| **Automated HFT (XAUUSD / Forex)** | Setup Proprietário | 🗑️ **NÃO PRIORITÁRIO** | Focado em Forex/Metatrader legado. Nosso foco de alta liquidez e liquidação rápida é Cripto Perpétuos (BingX/Bybit) e Solana on-chain. |

---

### 💻 Categoria 2: AI Coding, Vibe Coding & Engenharia de Software

| Ferramenta / Projeto | Repositório | Classificação | O que faz & Como serve ao Nexus Multi |
|---|---|---|---|
| **OpenCode & Goose** | `block/goose` | 💎 **OURO PURO** | Automação CLI, execução de scripts locais no SO e migrações. **No Nexus Multi:** Já serve como espinha dorsal do nosso CLI e da execução remota do `nexus-membro-sistema`. |
| **Plandex** | `plandex-ai/plandex` | 💎 **OURO PURO** | Gestão de diffs em múltiplos arquivos e branches protegidas. **No Nexus Multi:** Reflete a nossa skill `safe-dev` e `writing-plans`, garantindo que nenhum agente destrua código de outros módulos. |
| **Awesome Clones** | `awesome-clones` | 💎 **ACELERADOR** | +100 clones open-source (Airbnb, Uber, Trello, etc.). **No Nexus Multi:** Serve à **Vertical 5 (Incubadora de Micro-SaaS)** para acelerar o desenvolvimento de interfaces prontas sem reinventar a roda. |

---

### 🌐 Categoria 3: Web Scraping, Prospecção, APIs & Dados em Tempo Real

| Ferramenta / Projeto | Repositório | Classificação | O que faz & Como serve ao Nexus Multi |
|---|---|---|---|
| **Agent Reach** | `agent-reach` | 💎 **OURO PURO** | Navegação web com cookies autênticos contornando Cloudflare. **No Nexus Multi:** Permite que o `nexus-social-hub` leia o Twitter/X e GitHub sem bloqueios e sem pagar APIs exorbitantes. |
| **Gosom Maps Scraper** | `omkarcloud/gosom` | 💎 **OURO PURO** | Scraper em Go de alta velocidade para capturar empresas, telefones e WhatsApp. **No Nexus Multi:** Vira o coração do `nexus-data-harvest` (:3005). Beneficia o **Buscador** (geração de leads B2B) e o **LicitaRadar** (pesquisa de concorrentes). |
| **Public APIs Catalog** | `public-apis` | 💎 **OURO PURO** | +465k estrelas com catálogo de APIs gratuitas de CNPJ, câmbio, notícias e clima. **No Nexus Multi:** Conecta no Buscador e no Cérebro para enriquecimento de dados a custo zero de assinatura. |
| **OpenBB** | `OpenBB-finance/OpenBB` | 💎 **OURO PURO** | Terminal financeiro open-source modular. **No Nexus Multi:** Fornece os feeds macro e indicadores que alimentam o `nexus-macro-sentinel`. |

---

### 🛡️ Categoria 4: Segurança, Telefonia/Voz, CRM & Criação de Mídia

| Ferramenta / Projeto | Repositório | Classificação | O que faz & Como serve ao Nexus Multi |
|---|---|---|---|
| **Strix** | `strix-ai/strix` | 💎 **OURO PURO** | Agente de Pentesting autônomo (acha SQLi, CORS, chaves vazadas e gera correção). **No Nexus Multi:** Sentinela contínua de auditoria que testa periodicamente todos os endpoints públicos da holding (`.up.railway.app`). |
| **Tel-Agent** | `Dpro-at/Tel-Agent` | 💎 **INOVAÇÃO ALTA** | Chamadas de voz reais com IA local. **No Nexus Multi:** Integração com o **Buscador e Comunicação Hub** para criar o primeiro atendente telefônico autônomo da holding para qualificação de leads B2B. |
| **AgentTube** | `AgentTube` | 💎 **RECEITA PASSIVA** | Pipeline de vídeos para YouTube Shorts (pesquisa ➔ roteiro ➔ voz ➔ edição ➔ upload). **No Nexus Multi:** Já testado no `agentTubeEngine.ts`. Gera tráfego orgânico no YouTube/TikTok para atrair investidores para a Solana e clientes para os SaaS. |
| **Twenty CRM** | `twentyhq/twenty` | 💎 **OURO PURO** | CRM moderno open-source. **No Nexus Multi:** Container unificado conectado ao nosso mesmo Postgres central (`:5432`). Recebe leads gerados pelo Buscador e Licitações em uma interface gráfica impecável. |

---

### 🪙 Categoria 5: Memecoins, Gaming & Web3

| Ferramenta / Projeto | Repositório | Classificação | O que faz & Como serve ao Nexus Multi |
|---|---|---|---|
| **Memecoin Strategy Guide & Spotter**| On-Chain | 💎 **OURO PURO** | Filtros de RugCheck, liquidez bloqueada e tração social. **No Nexus Multi:** **JÁ INTEGRADO NO QUANT SOLANA** (com barramento de mintAuthority, LP destrancada e score < 500). |
| **Bank-Connected AI Agent** | Automação Financeira | 💎 **OURO PURO** | Liquidação bancária direta. **No Nexus Multi:** Conecta na vertical **Nexus Finance** e na conversão automática de lucros cripto (SOL/USDT) para reais via Pix/Solana Pay. |
| **NFT / Game Auto-Farming** | Game Bots | 🗑️ **LIXO / DESCARTAR** | Farm em jogos MMORPGs desvaloriza rápido, consome banda excessiva e tem risco severo de ban de conta. Descartado da estratégia principal. |

---

## 🏛️ 4. ESTRUTURAÇÃO DOS 4 MICRO-HUBS MULTI-PROJETOS

Para evitar que projetos fiquem inchados, a estratégia divide as ferramentas nos seguintes containers dedicados:

### 1. `nexus-social-hub` (Porta 3008)
* **Objetivo:** Ponto único de contato com o mundo externo (X/Twitter, Telegram, YouTube).
* **Endpoints Internos:**
  - `POST /v1/x/tweet`: Posta mensagens no X usando a conta do Janio (análises, alertas alpha, resultados).
  - `POST /v1/telegram/broadcast`: Dispara notificações para canais dedicados ou grupos.
* **Projetos Conectados:**
  - `nexus-quant-solana`: Posta tokens auditados com score 95+ e links de compra.
  - `Mercado Financeiro`: Posta resumo de fluxo institucional da Bybit.
  - `Licitações`: Envia alertas de licitações ganhas ou novas oportunidades.

### 2. `nexus-data-harvest` (Porta 3005)
* **Objetivo:** Motor de coleta e enriquecimento de dados em Go/Node.js de alta performance.
* **Serviços Embarcados:** Gosom Fast Maps Scraper + Public APIs Integradas.
* **Projetos Conectados:**
  - `Buscador`: Recebe 200 leads com WhatsApp e CNPJ em segundos.
  - `Nexus Cérebro`: Pode fazer varreduras sob demanda ordenada pelo Janio no Telegram.

### 3. `nexus-macro-sentinel` (Porta 4005)
* **Objetivo:** O "cérebro econômico institucional" da holding (inspirado no TradingAgents e OpenBB).
* **Cálculo Contínuo:**
  - Regime de Mercado: `BULLISH_TREND`, `BEARISH_DUMP`, `HIGH_VOLATILITY`, `RANGING`.
* **Projetos Conectados:**
  - `Mercado Financeiro`: Define se opera a favor ou contra a tendência.
  - `nexus-quant-solana`: Se o regime estiver em `BEARISH_DUMP`, suspende novas compras em memecoins para blindar a banca.

### 4. `nexus-strix-sentry` (Auditoria & Segurança)
* **Objetivo:** Pentester autônomo.
* **Ciclo de Trabalho:** Varre semanalmente as portas públicas e repositórios GitHub da holding Nexus para garantir que nenhuma chave privada ou credencial foi exposta e que as portas internas `.railway.internal` permaneçam 100% blindadas.

---

## 📋 5. ROTEIRO DE EXECUÇÃO PROGRESSIVA (FASE A FASE)

### Fase 1: Ativação do Nexus Social Hub & Canais Dedicados (Próximo Passo)
1. Criar o canal de Telegram exclusivo de Alpha da Solana (separado do Cérebro).
2. Configurar as credenciais da conta do X (Twitter) para publicação de alpha e atração de público.
3. Testar o disparo conjunto Solana ➔ Social Hub ➔ X/Telegram.

### Fase 2: Conexão Macro Sentinel (TradingAgents)
1. Criar endpoint `/api/macro-regime` no Mercado Financeiro.
2. Fazer o robô da Solana ler esse status antes de autorizar novos swaps na Jupiter.

### Fase 3: Aceleração do Buscador com Gosom
1. Subir o motor Gosom no `nexus-data-harvest` no Railway.
2. Conectar a API do Buscador para prospecção acelerada de clientes B2B.

### Fase 4: Integração de CRM e Voz (Twenty & Tel-Agent)
1. Subir o Twenty CRM no Postgres central.
2. Testar agente de voz para triagem comercial de novos clientes.
