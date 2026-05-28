FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shellder-agent-server/package.json ./shellder-agent-server/
COPY shellder-web-console/package.json ./shellder-web-console/
COPY shellder-job-worker/package.json ./shellder-job-worker/
RUN npm ci -w shellder-web-console --include-workspace-root=false

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY shellder-web-console ./shellder-web-console
WORKDIR /app/shellder-web-console
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build /app/shellder-web-console/public ./public
COPY --from=build --chown=nextjs:nodejs /app/shellder-web-console/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/shellder-web-console/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
