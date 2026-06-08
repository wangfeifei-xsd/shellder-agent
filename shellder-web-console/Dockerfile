FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shellder-agent-server/package.json ./shellder-agent-server/
COPY shellder-web-console/package.json ./shellder-web-console/
COPY shellder-job-worker/package.json ./shellder-job-worker/
RUN npm ci -w shellder-web-console --include-workspace-root=false

FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY shellder-web-console ./shellder-web-console
WORKDIR /app/shellder-web-console
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY shellder-web-console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/shellder-web-console/shellder /usr/share/nginx/html/shellder
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
