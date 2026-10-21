FROM ghcr.io/home-assistant/base:latest

ARG BUILD_VERSION=0.1.0
# Ollama works with the core image; SDKs can be included in a cloud-provider image.
ARG INSTALL_CLOUD_PROVIDERS=false

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="amd64|aarch64"

RUN apk add --no-cache nodejs npm python3 py3-yaml py3-pip

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN if [ "$INSTALL_CLOUD_PROVIDERS" = "true" ]; then \
      apk add --no-cache --virtual .llm-build-deps build-base python3-dev libffi-dev openssl-dev cargo cmake && \
      python3 -m venv --system-site-packages /opt/llm-venv && \
      /opt/llm-venv/bin/pip install --no-cache-dir -r /app/ha_llm_control/requirements.txt && \
      apk del .llm-build-deps; \
    fi
ENV PATH="/opt/llm-venv/bin:${PATH}"
RUN chmod a+x /app/run.sh

CMD ["/app/run.sh"]
