# syntax=docker/dockerfile:1
# ────────────────────────────────────────────────────────────────
# DJOUSSE TECH MD — image multiplateforme (VPS, Docker Compose,
# Fly.io, Koyeb, portainer…)
#
#   Build :  docker build -t djousse-tech-md .
#   Run :    docker run -d --env-file .env \
#              -v ./storage:/app/storage \
#              --name djousse djousse-tech-md
#
# Debian slim ET NON alpine : sharp, canvas et ffmpeg-static
# livrent des binaires glibc — ils échoueraient sous musl (alpine).
# Aucun port exposé : le bot est un worker pur, sans serveur HTTP.
# ────────────────────────────────────────────────────────────────
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim

LABEL org.opencontainers.image.title="DJOUSSE TECH MD"
LABEL org.opencontainers.image.description="Bot WhatsApp (Baileys) — worker sans port, session persistée sur volumes"

ENV NODE_ENV=production
WORKDIR /app

# Dépendances d'abord (couche cachable) : npm ci respecte le lockfile ;
# postinstall récupère ffmpeg-static et les binaires précompilés.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Code applicatif
COPY . .

# Audit de conformité au moment du BUILD : image non conforme = build raté.
# RUN node scripts/audit.js

# Session WhatsApp, base locale, jeux, téléchargements et logs :
# tout vit sous /app/storage, à monter en volume (sinon perdu au redémarrage).
VOLUME ["/app/storage"]

# node reçoit SIGTERM directement → arrêt propre (pas d'npm intermédiaire).
CMD ["node", "index.js"]
