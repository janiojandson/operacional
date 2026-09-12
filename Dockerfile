FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json tsconfig.json ./

# Instalar dependências completas para compilação
RUN npm install

# Copiar todo o código fonte
COPY . .

# Build do frontend Vite e do backend TypeScript
RUN npm run build:web

FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Instalar tsx globalmente para execução direta ou rodar via npx
RUN npm install -g tsx

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["tsx", "server/src/index.ts"]
