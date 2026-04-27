FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9876
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 9876
CMD ["node", "server.js"]
