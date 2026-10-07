# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build
COPY nest-cli.json tsconfig*.json prisma.config.ts ./
COPY src ./src
# Contract emit is offline; this URL has no credential and is never a runtime default.
RUN DATABASE_URL=postgresql://build_only@127.0.0.1:1/build_only npm run contract:emit \
    && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node docker/entrypoint.mjs ./docker/entrypoint.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["serve"]

# Administrative tools never ship in the application runtime image.
FROM build AS tools
COPY docker/entrypoint.mjs ./docker/entrypoint.mjs
COPY docs/backend-5b/aplicar-garantias.mjs ./docs/backend-5b/aplicar-garantias.mjs
RUN mkdir -p /app/migrations && chown node:node /app/migrations
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD ["verify"]
