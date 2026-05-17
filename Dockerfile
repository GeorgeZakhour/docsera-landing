# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy project files and build
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM nginx:alpine

# Custom server config: adds a /.well-known/ location that serves
# apple-app-site-association (no extension) + assetlinks.json as
# application/json. Required for iOS Universal Links and Android
# App Links verification to pass. Everything else stays identical
# to the nginx:alpine default behaviour.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
