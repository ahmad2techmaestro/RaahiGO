# --- RaahiGo API server ---
FROM node:20-alpine

# Alpine doesn't include curl by default; used by the HEALTHCHECK below.
RUN apk add --no-cache curl

WORKDIR /app

# Install dependencies first so Docker can cache this layer when only
# source files change, not package.json.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Run as a non-root user — the node:alpine image ships a "node" user
# for exactly this purpose.
RUN chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

CMD ["node", "index.js"]
