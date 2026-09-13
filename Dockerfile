FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json tsconfig.json ./

# Instalar todas as dependências necessárias
RUN npm install

# Copiar código fonte completo
COPY . .

# Build do frontend Vite
RUN npm run build:web

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["npx", "tsx", "server/src/index.ts"]
