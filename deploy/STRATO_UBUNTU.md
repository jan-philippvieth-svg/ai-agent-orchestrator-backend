# Strato Ubuntu VPS Deployment

Dieses Setup ist für einen Strato Ubuntu Server gedacht. Der Orchestrator und Qdrant laufen in Docker. Nach außen werden nur HTTP/HTTPS über Caddy geöffnet; Node-Port `3001` und Qdrant bleiben intern.

## 1. DNS vorbereiten

Lege im Strato DNS einen `A`-Record an:

```text
ai.example.com -> <VPS_PUBLIC_IPV4>
```

Warte, bis DNS auflöst:

```bash
dig +short ai.example.com
```

## 2. Server vorbereiten

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
```

Docker Engine installieren:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker version
docker compose version
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

## 3. Repo deployen

```bash
git clone https://github.com/jan-philippvieth-svg/ai-agent-orchestrator-backend.git
cd ai-agent-orchestrator-backend
cp deploy/env.vps.example .env
nano .env
mkdir -p data reports
```

Pflichtwerte in `.env` ersetzen:

```env
APP_DOMAIN=ai.example.com
API_KEY=<long-random-secret>
BFF_DEV_LOGIN_KEY=<long-random-login-secret>
BFF_SESSION_SECRET=<openssl-rand-hex-32>
CORS_ALLOWED_ORIGINS=https://ai.example.com
BFF_COOKIE_SECURE=true
```

Session Secret erzeugen:

```bash
openssl rand -hex 32
```

## 4. LLM/Embedding-Endpunkte konfigurieren

Wenn Ollama/LM Studio/Embedding auf demselben VPS-Host laufen:

```env
LLM_SMALL_URL=http://host.docker.internal:1234/v1/chat/completions
LLM_MEDIUM_URL=http://host.docker.internal:1235/v1/chat/completions
LLM_LARGE_URL=http://host.docker.internal:1236/v1/chat/completions
EMBEDDING_URL=http://host.docker.internal:11434/api/embeddings
```

Wenn die Modelle auf dem Mac Studio laufen, nutze eine Tailscale/VPN-Adresse:

```env
LLM_SMALL_URL=http://100.x.y.z:1234/v1/chat/completions
EMBEDDING_URL=http://100.x.y.z:11434/api/embeddings
```

## 5. Starten

```bash
docker compose -f docker-compose.strato.yml up -d --build
docker compose -f docker-compose.strato.yml ps
docker compose -f docker-compose.strato.yml logs -f orchestrator
```

Healthcheck:

```bash
curl -s https://ai.example.com/health \
  -H "x-api-key: <API_KEY>"
```

Interne UI:

```text
https://ai.example.com/ui
```

## 6. Updates

```bash
git pull
docker compose -f docker-compose.strato.yml up -d --build
docker compose -f docker-compose.strato.yml ps
```

## 7. Backups

Sichern:

- Docker Volume `qdrant_data`
- Ordner `./data`
- Ordner `./reports`

Beispiel:

```bash
mkdir -p backups
tar -czf "backups/app-data-$(date +%F).tar.gz" data reports
docker run --rm -v ai-agent-orchestrator-backend_qdrant_data:/qdrant -v "$PWD/backups:/backup" alpine \
  tar -czf "/backup/qdrant-$(date +%F).tar.gz" /qdrant
```

Wichtig: `data/privacy-payloads.json` kann personenbezogene Daten enthalten. Dieses Backup muss entsprechend geschützt werden.

## 8. Betrieb

Logs:

```bash
docker compose -f docker-compose.strato.yml logs -f
```

Neustart:

```bash
docker compose -f docker-compose.strato.yml restart orchestrator
```

Stop:

```bash
docker compose -f docker-compose.strato.yml down
```

Caddy/HTTPS prüfen:

```bash
docker compose -f docker-compose.strato.yml logs caddy
```

## 9. Sicherheitsnotizen

- Port `3001` nicht öffentlich öffnen.
- Qdrant nicht öffentlich öffnen.
- Nur `80` und `443` über UFW freigeben.
- API-Key und BFF-Login-Key lang und zufällig wählen.
- Für echte Internet-Nutzung später OIDC/SSO vor die BFF-Schicht setzen.
