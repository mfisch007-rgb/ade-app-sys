# Use Node 20.11.0 as the foundation
FROM node:20.11.0-slim

# Install system dependencies for Baileys/WhatsApp
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libuuid1 \
    && rm -rf /var/lib/apt/lists/*

# Create the app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your code
COPY . .

# Open the port
EXPOSE 3000

# Start the engine
CMD ["node", "src/server.js"]