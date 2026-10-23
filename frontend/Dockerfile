#install dependencies
FROM node:22-alpine AS deps
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm install

#build React application
FROM node:22-alpine AS builder

WORKDIR /app/frontend

COPY --from=deps /app/frontend/node_modules ./node_modules

COPY frontend/ ./

# frontend/.env is not copied in, so Vite reads the API address from here instead.
ARG VITE_API_URL

RUN npm run build

#serve production build
FROM nginx:alpine AS runner

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Send every unknown path to index.html so React Router handles page refreshes.
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 80;
  root /usr/share/nginx/html;
  location / { try_files $uri /index.html; }
}
EOF

EXPOSE 80

CMD ["nginx","-g", "daemon off;"]
