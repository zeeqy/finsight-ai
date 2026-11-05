# FinSight AI - web app image: builds the React client, then runs Express, which serves it and the API.
# Built by docker-compose.yml from the project root. See DEPLOY.md.

# 1. Build the React client
FROM node:24-alpine AS client
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Shown in the privacy notice and Terms of use (set in .env on the server)
ARG VITE_CONTACT_EMAIL=
ARG VITE_DATA_LOCATION=
ARG VITE_OPERATOR=
ENV VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL VITE_DATA_LOCATION=$VITE_DATA_LOCATION VITE_OPERATOR=$VITE_OPERATOR
RUN npm run build

# 2. Run Express with production dependencies only
FROM node:24-alpine
ENV NODE_ENV=production PORT=5000
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY server/scripts ./scripts
COPY server/sample_statements ./sample_statements
COPY server/schema.sql ./
COPY --from=client /build/client/dist /app/client/dist
RUN mkdir -p src/temp_uploads && chown -R node:node /app/server/src/temp_uploads
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health >/dev/null || exit 1
CMD ["node", "src/index.js"]
