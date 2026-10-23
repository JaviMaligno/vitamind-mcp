# Runs the stdio bridge. The MCP client speaks JSON-RPC over stdin/stdout, so there is
# no port to expose — introspection (initialize, tools/list) travels the same pipe.
#
# Note for anyone running this in a sandbox: the bridge relays to the hosted server at
# getvitamind.app, so the container needs outbound HTTPS. With no network it starts
# cleanly and then answers nothing, which looks like a hang rather than an error.
FROM node:24.22.1-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY index.js ./

ENTRYPOINT ["node", "index.js"]
