FROM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm install --frozen-lockfile --filter @iep/api... --filter @iep/db...
RUN mkdir /keys && chown node /keys
USER node
CMD ["pnpm", "--filter", "@iep/api", "start"]
