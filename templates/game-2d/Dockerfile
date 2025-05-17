# Build stage
FROM node:20-slim AS build

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /usr/src/app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy built files from build stage
COPY --from=build /usr/src/app/dist ./dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server/server.js"]