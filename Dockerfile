# Imagem opcional para hospedagens que usam Docker (Railway, Fly.io, VPS, etc.).
# O Render com runtime Node não precisa deste arquivo.
FROM node:22-alpine

WORKDIR /app

# O projeto não tem dependências externas, mas o comando mantém o padrão
# caso alguma seja adicionada no futuro.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NOODLE_SECURE_COOKIES=1
ENV NOODLE_DATA_DIR=/var/data
ENV TZ=America/Sao_Paulo

RUN mkdir -p /var/data
VOLUME ["/var/data"]

EXPOSE 8080
CMD ["node", "server.js"]
