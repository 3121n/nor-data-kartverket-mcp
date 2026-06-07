# Apify Actor image for the Kartverket MCP server (standby mode).
# Based on Apify's MCP server template. See:
# https://docs.apify.com/sdk/js/docs/guides/docker-images
FROM apify/actor-node:20 AS builder

# Copy manifests first to leverage Docker layer caching.
COPY --chown=myuser:myuser package*.json ./

# Install ALL dependencies (incl. dev + optional: typescript, apify, express, cors).
RUN npm install --include=dev --include=optional --audit=false

# Copy sources and build dist/.
COPY --chown=myuser:myuser . ./
RUN npm run build

# ---- Final runtime image ----
FROM apify/actor-node:20

COPY --chown=myuser:myuser package*.json ./

# Install only production + optional deps (apify, express, cors, sdk, zod);
# skip dev deps to keep the image small.
RUN npm --quiet set progress=false \
    && npm install --omit=dev --include=optional --audit=false \
    && echo "Node.js version:" \
    && node --version \
    && rm -r ~/.npm

# Copy the compiled output from the builder stage.
COPY --from=builder --chown=myuser:myuser /usr/src/app/dist ./dist

# Copy remaining source/config files.
COPY --chown=myuser:myuser . ./

# Start the MCP server over Streamable HTTP on the Apify standby port.
CMD ["node", "dist/apify.js"]
