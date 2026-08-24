# Build stage: produces the same static dist/ that `npm run build` does
# locally (see README.md "Verify"), including the service worker's
# hashed precache manifest (vite.config.ts's swPrecachePlugin).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: nginx serving the built app, with the same routing/caching
# rules as the previous host-mounted deploy/nginx.conf (deploy/README.md).
# No app code or config is bind-mounted anymore -- it's baked into the image,
# so a deploy is `docker compose pull && docker compose up -d`.
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
