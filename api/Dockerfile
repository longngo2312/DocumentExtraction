#Install dependencies
FROM node:22-alpine AS deps

WORKDIR /app/api

COPY api/package.json api/package-lock.json ./

RUN npm install 

#Build the application

FROM node:22-alpine AS builder

WORKDIR /app/api

COPY --from=deps /app/api/node_modules ./node_modules

COPY api/ ./

RUN npm run build

#Production runtime 

FROM node:22-alpine AS runner 

WORKDIR /app/api

ENV NODE_ENV=production

COPY api/package.json api/package-lock.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/api/dist ./dist

EXPOSE 3000

CMD [ "node", "dist/server.js" ]