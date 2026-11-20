FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginx:stable-alpine
RUN apk add --no-cache curl
ARG NGINX_CONFIG=client/nginx.conf
COPY ${NGINX_CONFIG} /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
