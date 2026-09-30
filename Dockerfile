# «Граф денег» — one image, one process.
#
#   docker compose up --build        # the one command; see docker-compose.yml
#
# Three stages. `deps` installs from the lockfile only, so a source edit does not reinstall
# packages. `build` runs `pnpm build`, whose `prebuild` hook runs the pipeline: the analysis is
# rebuilt from data/*.parquet inside the image, the same way a reviewer's clone would. `run` holds
# only Next's standalone server, its static files and the analysis — no dev dependencies, no source,
# no `.env`.
#
# Secrets never enter the image: `.dockerignore` excludes every `.env*` but the example, and keys
# arrive at run time from the environment (docker-compose.yml passes `.env`).

ARG NODE_VERSION=24-alpine

# --- pnpm, fetched once ---------------------------------------------------------------------------
# corepack downloads pnpm on first use. Doing it in one shared stage means one download, cached in
# its layer, instead of one per stage — and one place to fail on a flaky network, not two.
FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json ./
RUN corepack enable && corepack install

# --- dependencies -------------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build --------------------------------------------------------------------------------------
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
# The build needs no model and no tracker. The scripted provider keeps env validation from asking
# for a key that has no business in a build.
ENV LLM_PROVIDER=mock
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- run ----------------------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS run
WORKDIR /app
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	HOSTNAME=0.0.0.0 \
	PORT=3000 \
	STATE_DIR=/app/state

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Read at request time by getAnalysis(), so it is copied rather than traced into the bundle.
COPY --from=build --chown=node:node /app/output ./output

# Conversations and ratings. A named volume in docker-compose.yml keeps them across restarts.
RUN mkdir -p /app/state && chown node:node /app/state
VOLUME ["/app/state"]

USER node
EXPOSE 3000

# 200 while the service can answer, 503 when the analysis is missing (see /api/health). Node's
# own fetch, because the alpine image has no curl and adding one is a package for one line.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
