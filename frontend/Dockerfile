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

# /api goes to the API container; every other unknown path gets index.html so
# React Router handles page refreshes.
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 80;
  root /usr/share/nginx/html;
  # Above multer's 25 MB limit so oversized uploads get the API's error, not nginx's.
  client_max_body_size 30m;
  location / { try_files $uri /index.html; }
  # nginx's mime.types has no .mjs, and browsers refuse module scripts (the PDF.js worker) served as octet-stream.
  location ~ \.mjs$ { default_type application/javascript; }
  location /api/ {
    proxy_pass http://api:3000;
    # Chat and extraction calls can wait on Ollama well past nginx's 60s default.
    proxy_read_timeout 300s;
  }
}
EOF

EXPOSE 80

CMD ["nginx","-g", "daemon off;"]
