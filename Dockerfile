# Use Node.js 18 LTS
FROM node:18-alpine

# Install build dependencies for native modules (bcrypt, sqlite3)
RUN apk add --no-cache curl python3 make g++

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies (rebuild native modules for Alpine Linux)
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Set proper permissions
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check - using node process check since bot doesn't have HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD pgrep -f "node" || exit 1

# Start the bot by default (use docker-compose to override if needed)
CMD ["npm", "run", "start:bot"]
