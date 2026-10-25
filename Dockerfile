# Build stage: compile TypeScript with dev dependencies present.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies and compiled output only.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
COPY LICENSE ./LICENSE
ENV HOST=0.0.0.0 DATA_DIR=/app/data
USER node
EXPOSE 3000
CMD ["node", "dist/http.js"]
