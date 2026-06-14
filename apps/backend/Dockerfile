FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm install --workspace apps/backend --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app/apps/backend
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/prisma ./prisma
COPY --from=build /app/apps/backend/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
