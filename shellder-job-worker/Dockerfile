FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shellder-agent-server/package.json ./shellder-agent-server/
COPY shellder-web-console/package.json ./shellder-web-console/
COPY shellder-job-worker/package.json ./shellder-job-worker/
RUN npm ci -w shellder-job-worker --include-workspace-root=false

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY shellder-agent-server/prisma ./shellder-agent-server/prisma
COPY shellder-job-worker ./shellder-job-worker
WORKDIR /app/shellder-job-worker
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shellder-job-worker/dist ./dist
COPY --from=build /app/shellder-job-worker/package.json ./
EXPOSE 3002
CMD ["node", "dist/main.js"]
