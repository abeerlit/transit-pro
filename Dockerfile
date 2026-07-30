FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install ALL deps (dev included) so the build step has vite/react-router available
RUN npm ci && npm cache clean --force

COPY . .

# Build the app
RUN npm run build

# Strip dev deps after build to keep the image small
RUN npm prune --production && npm cache clean --force
RUN npm remove @shopify/cli || true

CMD ["npm", "run", "docker-start"]
