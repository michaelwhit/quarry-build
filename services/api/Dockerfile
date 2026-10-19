FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm install --frozen-lockfile --filter @iep/api... --filter @iep/db...
RUN mkdir /keys && chown node /keys
USER node
CMD ["pnpm", "--filter", "@iep/api", "start"]
