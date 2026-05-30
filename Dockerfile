FROM node:20-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY web ./web
COPY data/anchors.json ./data/anchors.json
COPY .env.example ./.env.example
RUN mkdir -p data reports && chown -R node:node /app

USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "const port=process.env.PORT||3001; const key=process.env.API_KEY||'dev-secret'; fetch(`http://127.0.0.1:${port}/health`,{headers:{'x-api-key':key}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1));"]
CMD ["node", "dist/server.js"]
