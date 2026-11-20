FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY server/scripts ./scripts
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "src/index.js"]
