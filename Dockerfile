# Node 24 runs TypeScript directly by stripping the types, so there is no build step.
# The service has zero runtime dependencies, so there is no install step either: the
# image is the base plus a few kilobytes of source. That is what keeps cold starts
# inside Discord's 3-second response deadline.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY src ./src

USER node
EXPOSE 8080

CMD ["node", "src/index.ts"]
