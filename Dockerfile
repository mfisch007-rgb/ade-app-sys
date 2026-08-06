# Use official Node.js 20 ESM Runtime image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source and configuration
COPY . .

# Expose API Gateway Port
EXPOSE 3000

# Default command launches the API Gateway
CMD ["node", "src/gateway/api-server.js"]
