# API de KiteERP
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @kite/api... || pnpm install --filter @kite/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @kite/api build

FROM node:22-alpine
WORKDIR /app/apps/api
ENV NODE_ENV=production TZ=Europe/Madrid
RUN apk add --no-cache tzdata
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/api/src/db/sql ./src/db/sql
COPY --from=build /app/apps/api/package.json ./
EXPOSE 4000
USER node
CMD ["node", "dist/server.js"]
