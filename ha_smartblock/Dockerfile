FROM ghcr.io/home-assistant/base:latest

ARG BUILD_VERSION=0.1.0

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="amd64|aarch64"

RUN apk add --no-cache nodejs npm python3 py3-yaml

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN chmod a+x /app/run.sh

CMD ["/app/run.sh"]
