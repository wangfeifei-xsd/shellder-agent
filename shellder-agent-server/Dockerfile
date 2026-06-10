FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shellder-agent-server/package.json ./shellder-agent-server/
COPY shellder-web-console/package.json ./shellder-web-console/
COPY shellder-job-worker/package.json ./shellder-job-worker/
RUN npm ci -w shellder-agent-server --include-workspace-root=false

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY shellder-agent-server ./shellder-agent-server
WORKDIR /app/shellder-agent-server
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shellder-agent-server/dist ./dist
COPY --from=build /app/shellder-agent-server/package.json ./
EXPOSE 3001
CMD ["node", "dist/main.js"]
