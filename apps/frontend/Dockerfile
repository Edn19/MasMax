FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api
ARG VITE_MAX_VIDEO_UPLOAD_MB=2048
ARG VITE_ALLOWED_EMBED_DOMAINS=youtube.com,player.vimeo.com,drive.google.com
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAX_VIDEO_UPLOAD_MB=$VITE_MAX_VIDEO_UPLOAD_MB
ENV VITE_ALLOWED_EMBED_DOMAINS=$VITE_ALLOWED_EMBED_DOMAINS
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm install --workspace apps/frontend --include-workspace-root
COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
