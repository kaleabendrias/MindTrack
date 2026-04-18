FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 \
    libatspi2.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxext6 libxshmfence1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @playwright/test@1.47.0

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npx playwright install --with-deps chromium
