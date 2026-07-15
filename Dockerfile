# bexio-mcp — streamable HTTP MCP server for the bexio API
#
# Build:  docker build -t bexio-mcp .
#
# Multi-user (default, recommended): clients authenticate per request with
# their own bexio bearer token; anonymous sessions are rejected.
#   docker run -p 8722:8722 bexio-mcp
#
# Shared identity: ONLY with BEXIO_HTTP_SHARED_IDENTITY=true — this serves the
# configured bexio account to EVERY client that can reach the port, without any
# authentication. Publish to loopback or a private network only:
#   docker run -p 127.0.0.1:8722:8722 -v bexio-tokens:/data \
#     -e BEXIO_CLIENT_ID=... -e BEXIO_CLIENT_SECRET=... -e BEXIO_REFRESH_TOKEN=... \
#     -e BEXIO_HTTP_SHARED_IDENTITY=true bexio-mcp

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# Note: the shared-identity gate stays CLOSED by default — set
# BEXIO_HTTP_SHARED_IDENTITY=true explicitly to expose a server identity.
ENV NODE_ENV=production \
    BEXIO_HTTP_HOST=0.0.0.0 \
    BEXIO_HTTP_PORT=8722 \
    BEXIO_TOKEN_STORE=/data/tokens.json
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
VOLUME /data
EXPOSE 8722
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8722/healthz || exit 1
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["serve-http"]
