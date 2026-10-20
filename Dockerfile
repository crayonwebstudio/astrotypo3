# Astro frontend for astrotypo3.woodwolfdigital.com
# Build context is the repository root (Coolify). The app is self contained:
# it bundles synced copies of the shared registry, templates and fixtures.
FROM node:24-alpine
WORKDIR /app
COPY apps/astro-frontend/package.json apps/astro-frontend/package-lock.json ./
RUN npm ci
COPY apps/astro-frontend/ ./
RUN npm run build
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
