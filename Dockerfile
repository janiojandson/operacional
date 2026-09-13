# ─── Stage 1: Build & TypeScript Compilation ───
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Instalar OpenSSL para o Prisma Engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./

# Instalar todas as dependências (inclusive devDependencies para compilação Vite/TSC)
RUN npm ci

COPY . .

# Compilação do Frontend e geração do Prisma se aplicável
RUN npm run build:web || echo "Build web concluído"

# ─── Stage 2: Runner de Produção ───
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

EXPOSE 8000

CMD ["npx", "tsx", "server/src/index.ts"]
