FROM oven/bun:alpine

WORKDIR /app

# Copy dependency files
COPY package.json bun.lock bunfig.toml ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application
RUN bun run build

# Expose port
EXPOSE 3000

# Start the application preview server (since Vercel is the main target, this is just for local testing)
CMD ["bun", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
