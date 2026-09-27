# 🏛️ Plano Diretor: Hub de Serviços Compartilhados Nexus (Infraestrutura Multi-Projetos)

> **Documento Estratégico & Operacional para Evolução e Inovação da Holding Nexus**  
> *Versão:* 1.0.0 | *Objetivo:* Transformar as melhores ferramentas open-source em microsserviços compartilhados na malha privada Railway (`.railway.internal`), servindo múltiplos projetos simultaneamente sem duplicação de código nem desperdício de recursos.

---

## 🎯 1. Filosofia: "Construir uma vez, servir a todos"

Em vez de cada projeto (Solana, Mercado Financeiro, Buscador, Licitações, Cérebro) ter seu próprio scraper, seu próprio client do Twitter/Telegram ou sua própria inteligência de segurança, criamos **Serviços Centrais Especializados** na malha interna do Railway.

Cada serviço roda em uma porta interna exclusiva com **latência sub-10ms** e **custo de rede R$ 0,00**.

---

## 🏗️ 2. Mapa dos Hubs Compartilhados e Projetos Beneficiários

```
                                  ┌──────────────────────────────┐
                                  │   POSTGRESQL CENTRAL (:5432)  │
                                  └──────────────┬───────────────┘
                                                 │
 ┌───────────────────────────────────────────────┴───────────────────────────────────────────────┐
 │                               MALHA PRIVADA RAILWAY (.railway.internal)                       │
 ├─────────────────────────┬─────────────────────────┬─────────────────────────┬─────────────────┤
 │  🌐 NEXUS SOCIAL HUB    │  🔍 NEXUS DATA HARVEST  │  🛡️ NEXUS STRIX SENTRY  │  📈 MACRO ADVISOR
 │  (X / Twitter, Telegram)│  (Gosom, Public APIs)   │  (Auditoria & Proteção) │  (TradingAgents)
 └────────────┬────────────┴────────────┬────────────┴────────────┬────────────┴────────────┬────┘
              │                         │                         │                         │
 ┌────────────▼─────────────────────────▼─────────────────────────▼─────────────────────────▼────┐
 │                                   PROJETOS BENEFICIÁRIOS                                      │
 ├───────────────────────┬─────────────────────────┬───────────────────────┬─────────────────────┤
 │ ⚡ Quant Solana       │ 📈 Mercado Financeiro   │ 🔍 Buscador / Leads   │ 🏛️ Licitações       │
 │ - Posta Alpha no X    │ - Regime de Mercado     │ - Extração rápida     │ - Alertas Telegram  │
 │ - Alertas Telegram    │ - Macro Sentinel        │ - Enriquecimento B2B  │ - Monitor editais   │
 └───────────────────────┴─────────────────────────┴───────────────────────┴─────────────────────┘
```

---

## 💎 3. Detalhamento dos 4 Hubs de Infraestrutura Compartilhada

### 📡 Hub 1: `nexus-social-hub` (Porta Interna 3008)
* **Objetivo:** Gestor unificado de presença pública, alertas e monetização externa.
* **Componentes:**
  - **Motor X (Twitter):** Integração via API / sessão autenticada para postar análises, relatórios e engajamento com a comunidade.
  - **Motor Telegram (Canais & Bots):**
    - **Recomendação Estratégica:** Criar um **Canal/Grupo Telegram Exclusivo da Solana / Alpha** (ex: `Nexus Quant Alpha ⚡`), para não poluir o Telegram do Cérebro (que é focado em comando executivo e alertas operacionais da Holding). O Cérebro mantém seu chat privado executivo com o Janio.
* **Beneficiários Imediatos:**
  - `nexus-quant-solana`: Dispara alertas de tokens aprovados com score 95+, vetos de rugs de alta liquidez e solicitação de gorjetas (Solana Pay).
  - `Mercado Financeiro`: Publica relatórios de fechamento de mercado e sinais institucionais.
  - `Licitações`: Notifica os empresários clientes de editais abertos.

---

### 🔍 Hub 2: `nexus-data-harvest` (Inspirado no Gosom & Public APIs - Porta Interna 3005)
* **Objetivo:** Motor de extração e enriquecimento de dados em alta velocidade, escrito em Go/Node.js ultra-leve.
* **Componentes:**
  - Motor Gosom para extração instantânea do Google Maps (empresas, telefones, redes sociais).
  - Catálogo de APIs públicas para enriquecimento de CNPJ, cotações, moedas e clima sem pagar provedores.
* **Beneficiários Imediatos:**
  - `Buscador`: Deixa de sofrer com timeouts de Puppeteer pesado e entrega listas limpas de leads em 3 segundos.
  - `Nexus Cérebro`: Pode minerar dados de qualquer setor sob comando do Sócio no Telegram (`!agir Buscar fornecedores em Curitiba`).
  - `Licitações`: Cruza dados cadastrais dos licitantes e concorrentes.

---

### 📈 Hub 3: `nexus-macro-sentinel` (Inspirado no TradingAgents & OpenBB - Porta Interna 4005)
* **Objetivo:** Sentinela de regime de mercado institucional e macroeconomia.
* **Componentes:**
  - Monitor de Dominância do Bitcoin (BTC.D), Volatilidade da Solana e fluxo de liquidez global.
  - Emite a bandeira do mercado: `RISK_ON` (propício para memecoins/altcoins) ou `RISK_OFF` (modo defensivo / corte de exposição).
* **Beneficiários Imediatos:**
  - `nexus-quant-solana`: Se o regime estiver em `RISK_OFF`, o robô trava compras em micro-caps para não comprar topos de mercado em dias de sangria generalizada.
  - `Mercado Financeiro`: Ajusta a alavancagem dos 11 pares perpétuos da BingX de acordo com a maré macro.

---

### 🛡️ Hub 4: `nexus-strix-sentry` (Auditoria e Segurança Ativa)
* **Objetivo:** Testes contínuos de segurança contra brechas, injeções de SQL, exposição de credenciais e integridade de APIs.
* **Componentes:**
  - Varredura de dependências npm/docker antes de subir deploys.
  - Testes de penetração internos garantindo que ninguém de fora acesse as portas `.railway.internal`.
* **Beneficiários Imediatos:**
  - **Todos os projetos da Holding Nexus.**

---

## 🚀 4. Plano de Implementação em Fases

### Fase 1: Criação do `nexus-social-hub` & Canal Telegram Dedicado (Imediato)
1. **Telegram Dedicado:** Criar um canal/bot exclusivo (ex: `@NexusQuantSolanaBot` ou canal de Alpha) para concentrar os sinais do robô da Solana sem misturar com as conversas executivas do Janio com o Cérebro.
2. **Conta do X (Twitter):** Configurar o cliente com as credenciais da sua conta do X para publicação de Alpha e transparência de PnL.
3. **Endpoint Interno:** `POST http://nexus-social-hub.railway.internal:3008/broadcast` permitindo que a Solana envie tweets e mensagens com uma única linha de código.

### Fase 2: Otimização do Buscador via `nexus-data-harvest` (Gosom)
1. Subir o worker do Gosom como serviço stateless no Railway.
2. Plugar na rota do Buscador para geração comercial de caixa e leads B2B.

### Fase 3: Conexão Macro Sentinel (TradingAgents) entre Mercado Financeiro e Solana
1. O Mercado Financeiro calcula a temperatura macro da Bybit/BingX.
2. A Solana consulta a temperatura antes de cada entrada on-chain.

---

## 📋 Decisões Estratégicas para o Janio:
1. **Telegram:** Aprova a criação de um **Canal de Alpha dedicado** para a Solana (recomendado), mantendo o bot do Cérebro focado em governança?
2. **Conta do X:** Quais credenciais você deseja utilizar (API Keys de Developer do X ou automação de sessão)?
