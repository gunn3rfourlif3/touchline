# syntax=docker/dockerfile:1

# Node 22 on Alpine, matching the box's other Node containers. Pinned to a
# digest-free tag on purpose: bump it deliberately, not on every rebuild.
ARG NODE_VERSION=22-alpine

# --- deps ------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci honours the lockfile exactly. A build that silently resolves a
# different tree than the one tested is not the thing that was tested.
RUN npm ci

# --- build -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No real secrets at build time. Next needs these to exist, not to be valid:
# nothing in the build touches the database or sends an OTP.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV AUTH_SECRET=build-time-placeholder
ENV OTP_PEPPER=build-time-placeholder
RUN npm run build

# --- migrate ---------------------------------------------------------------
# Runs drizzle-kit against the live database, then exits. Compose runs this
# to completion before the app starts, so the app never meets a schema it
# does not expect.
FROM node:${NODE_VERSION} AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db ./src/db
RUN npm ci --include=dev
CMD ["npx", "drizzle-kit", "migrate"]

# --- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run as root. node:alpine ships a `node` user at uid 1000.
RUN apk add --no-cache wget
USER node

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000

# Caddy will not route to an unhealthy container. wget rather than curl:
# smaller, and already the Alpine convention.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
