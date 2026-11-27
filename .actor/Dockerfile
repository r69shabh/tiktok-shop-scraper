FROM apify/actor-node-playwright-chrome:20

COPY --chown=myuser:myuser package.json package-lock.json ./
RUN npm ci --include=dev

COPY --chown=myuser:myuser tsconfig.json ./
COPY --chown=myuser:myuser src ./src
RUN npm run build && npm prune --omit=dev

CMD ["npm", "start"]
