FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache tzdata

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm install; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  else npm install; \
  fi

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
