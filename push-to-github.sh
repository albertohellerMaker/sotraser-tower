#!/bin/bash
# Script para subir cambios a GitHub
# Uso: bash push-to-github.sh "mensaje del commit"

MSG="${1:-Update desde Replit}"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ Error: GITHUB_TOKEN no está configurado"
  exit 1
fi

REPO="https://${GITHUB_TOKEN}@github.com/albertohellerMaker/sotraser-tower.git"

git config user.email "replit@sotraser.cl"
git config user.name "SOTRASER Replit"

git add -A
git commit -m "$MSG" 2>/dev/null || echo "ℹ️  Sin cambios nuevos para commitear"
git push "$REPO" main

echo "✅ Push completado a github.com/albertohellerMaker/sotraser-tower"
