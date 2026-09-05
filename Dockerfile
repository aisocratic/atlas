FROM node:24-bookworm-slim
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.8.0 --activate
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm build && chown -R node:node /app /opt/corepack
ENV NODE_ENV=production ATLAS_HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
