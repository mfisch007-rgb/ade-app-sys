# --- Stage 1: Get a tiny, static FFmpeg binary ---
FROM mwader/static-ffmpeg:6.0 AS ffmpeg-source

# --- Stage 2: Build the actual app ---
FROM node:20.11.0-slim

# Install only the essential system library (libuuid1)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libuuid1 && \
    rm -rf /var/lib/apt/lists/*

# Copy FFmpeg and FFprobe from the first stage
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/

# Set work directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# Copy the rest of the application
COPY . .

# Environment setup
EXPOSE 3000

# Start the engine
CMD ["node", "src/server.js"]