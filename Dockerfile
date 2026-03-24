FROM harbor.spooty.io/dockerhub/library/node:22-trixie-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/
COPY packages/adapters/litellm-gateway/package.json packages/adapters/litellm-gateway/
COPY packages/adapters/stax-orchestrator/package.json packages/adapters/stax-orchestrator/
COPY packages/plugins/sdk/package.json packages/plugins/sdk/
COPY packages/plugins/create-staple-plugin/package.json packages/plugins/create-staple-plugin/

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @stapleai/plugin-sdk build
RUN pnpm --filter @stapleai/ui build
RUN pnpm --filter @stapleai/server build
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)

FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /app /app
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai \
  && mkdir -p /staple \
  && chown node:node /staple

ENV NODE_ENV=production \
  HOME=/staple \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  STAPLE_HOME=/staple \
  STAPLE_INSTANCE_ID=default \
  STAPLE_CONFIG=/staple/instances/default/config.json \
  STAPLE_DEPLOYMENT_MODE=authenticated \
  STAPLE_DEPLOYMENT_EXPOSURE=private

VOLUME ["/staple"]
EXPOSE 3100

USER node
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
