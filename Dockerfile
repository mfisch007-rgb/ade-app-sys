FROM node:24-alpine AS builder`nWORKDIR /app`nCOPY package*.json ./`nRUN npm ci --only=production`nCOPY . .`nEXPOSE 3000`nCMD ["node", "index.js"]
