# EditEase

Modular bioinformatics platform for plant promoter analysis and CRISPR sgRNA design.

| Module | Purpose |
|---|---|
| 1. Retrieval | Fetch sequences from NCBI / Ensembl Plants / Sol Genomics, with custom upstream-downstream regions |
| 2. Promoter analysis | Scan PlantCARE & PlantPAN cis-regulatory elements and TF binding sites |
| 3. Visualization | TBtools-style cis-element maps as publication-quality PNG / SVG / PDF + interactive HTML |
| 4. sgRNA design | CHOPCHOP-style design with Cas-OFFinder off-targets and RNAfold structure scoring |

**Stack**: Next.js 14 + Tailwind, FastAPI, Celery + Redis, Biopython, matplotlib + Plotly, Docker Compose.

---

## Folder structure

```
editease/
├── backend/                       FastAPI + Celery
│   ├── app/
│   │   ├── main.py                FastAPI entrypoint
│   │   ├── core/                  config, logging, celery_app
│   │   ├── api/                   REST routes (retrieve, promoter, sgrna, jobs, health)
│   │   ├── services/              retrieval.py, promoter.py, visualization.py, sgrna.py
│   │   ├── workers/               Celery tasks
│   │   ├── schemas/               Pydantic models
│   │   ├── tools/                 cis_motifs.py (PlantCARE/PlantPAN curated motif library)
│   │   └── utils/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                      Next.js 14 + Tailwind
│   ├── app/
│   │   ├── page.tsx, layout.tsx
│   │   ├── retrieve/, promoter/, visualize/, sgrna/, jobs/[id]/
│   ├── components/JobStatus.tsx
│   ├── lib/api.ts
│   └── Dockerfile
├── docker/nginx.conf              Production reverse-proxy template
├── scripts/dev.sh                 Run everything locally without Docker
├── scripts/sample_requests.sh     curl examples for every endpoint
├── docker-compose.yml             Full stack (redis + backend + worker + frontend [+ flower])
├── .env.example
└── README.md
```

---

## Architecture

```
Browser ──▶ Next.js (3000) ──▶ FastAPI (8000) ──▶ Redis ◀── Celery worker
                                                              │
                                                              ├─ retrieval.py
                                                              ├─ promoter.py + visualization.py
                                                              └─ sgrna.py
                                                              │
                                                       /data/jobs/{job_id}/
```

All long-running work (retrieval, scanning, design) is dispatched to Celery, results stored under `/data/jobs/{job_id}/` and served by `/api/jobs/{id}/files` + `/api/jobs/{id}/download/{path}`.

---

## 1. Local deployment (Docker Compose, recommended)

Requires Docker 20+ and Docker Compose v2.

```bash
git clone <your-fork> editease && cd editease
cp .env.example .env
# edit .env: set NCBI_EMAIL to your real email; set SECRET_KEY
docker compose up -d --build
```

Services:

| URL | What |
|---|---|
| http://localhost:3000 | Next.js UI |
| http://localhost:8000/docs | Interactive Swagger / OpenAPI |
| http://localhost:8000/api/health | Healthcheck (also reports tool availability) |

Optional Celery monitoring UI:

```bash
docker compose --profile monitoring up -d flower
# → http://localhost:5555
```

Logs:

```bash
docker compose logs -f backend worker
```

Tear down (keep data):

```bash
docker compose down
```

Tear down (delete data):

```bash
docker compose down -v
```

---

## 2. Local deployment (no Docker)

Requires Python 3.11+, Node 20+, Redis 7+.

```bash
cp .env.example .env
./scripts/dev.sh
```

The script bootstraps a venv, installs deps, starts Redis, uvicorn, Celery worker, and `next dev` together. Hit Ctrl+C to stop everything.

To install the optional CLI tools manually:

```bash
# macOS
brew install viennarna bowtie

# Ubuntu / Debian
sudo apt install viennarna bowtie

# cas-offinder (build from source)
git clone https://github.com/snugel/cas-offinder.git && cd cas-offinder
cmake . && make && sudo install -m 755 cas-offinder /usr/local/bin/
```

If a tool is missing, EditEase falls back to a pure-Python implementation (slower, less accurate) and notes the degradation in `/api/health`.

---

## 3. Cloud deployment

### 3a. Single VPS (DigitalOcean / Hetzner / AWS EC2 / Linode)

This is the simplest production setup — one box, Docker Compose, Nginx + Let's Encrypt.

**Provision** an Ubuntu 22.04 box (2 vCPU / 4 GB RAM minimum; 8 GB recommended for off-target searches):

```bash
# On the VPS:
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo usermod -aG docker $USER && newgrp docker

git clone <your-repo> /opt/editease && cd /opt/editease
cp .env.example .env
# Edit .env. Set:
#   APP_ENV=production
#   SECRET_KEY=$(openssl rand -hex 32)
#   CORS_ORIGINS=https://yourdomain.com
#   NEXT_PUBLIC_API_URL=https://yourdomain.com
#   NCBI_EMAIL=you@yourdomain.com

docker compose up -d --build
```

**Configure DNS** at your registrar:

```
A    yourdomain.com         → <VPS public IP>
A    www.yourdomain.com     → <VPS public IP>
```

**Set up Nginx + HTTPS**:

```bash
sudo cp docker/nginx.conf /etc/nginx/sites-available/editease.conf
sudo sed -i 's/YOUR_DOMAIN/yourdomain.com/g' /etc/nginx/sites-available/editease.conf
sudo ln -s /etc/nginx/sites-available/editease.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Certbot will edit the config to add real cert paths and auto-renew via systemd timer.
```

Verify: `https://yourdomain.com` should now serve the UI; `https://yourdomain.com/api/health` returns JSON.

### 3b. Split deployment — Vercel (frontend) + Render/Railway (backend)

Use this if you want managed hosting.

**Backend on Render** (recommended for Celery support):

1. Push the repo to GitHub.
2. On Render, create a new **Blueprint** (or three separate services):
   - **Web Service**: `backend/Dockerfile`, port 8000, env vars from `.env.example`.
   - **Background Worker**: same Dockerfile, command `celery -A app.core.celery_app.celery_app worker --loglevel=info --concurrency=2`.
   - **Redis**: Render Redis add-on (or Upstash). Copy the connection URL into `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`.
3. Add a Render Persistent Disk mounted at `/data` (5–20 GB).
4. Set `CORS_ORIGINS=https://your-vercel-app.vercel.app` (and your custom domain).
5. Deploy. Note the URL, e.g. `https://editease-api.onrender.com`.

**Backend on Railway** is essentially identical: create a Service from the repo, add a Redis plugin, add a second service for the worker with the Celery command, add a volume mounted at `/data`.

**Frontend on Vercel**:

1. Import the repo on Vercel; set the **Root Directory** to `frontend/`.
2. Framework preset: Next.js (auto-detected).
3. Environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://editease-api.onrender.com
   ```
4. Deploy. Vercel automatically gives you `https://your-app.vercel.app` with HTTPS.
5. Add a custom domain if desired (Vercel → Settings → Domains).

After both are up, update the backend's `CORS_ORIGINS` to include the Vercel URL, then redeploy the backend.

---

## 4. Production hardening

### 4a. HTTPS

- Single VPS: covered by `certbot` above. Auto-renewal is enabled via the `certbot.timer` systemd unit (verify with `systemctl list-timers | grep certbot`).
- Vercel / Render / Railway: HTTPS is automatic.

### 4b. Environment configuration

- Never commit `.env`. Generate a strong `SECRET_KEY`:
  ```bash
  openssl rand -hex 32
  ```
- Set `APP_ENV=production` to switch logging from DEBUG → INFO.
- Restrict `CORS_ORIGINS` to your real domain(s); never use `*` in production.
- Add an `NCBI_API_KEY` to lift the 3-req/sec NCBI limit to 10 req/sec.

### 4c. Scaling basics

- **Horizontal worker scaling** (compose):
  ```bash
  docker compose up -d --scale worker=4
  ```
  Each worker has `--concurrency=2`, so this gives 8 parallel jobs.
- **Move Redis off-box** for >1 backend node: use Upstash, Redis Cloud, or AWS ElastiCache. Update the three `*_URL` env vars.
- **Shared storage** for multi-node deploys: replace the `editease_data` volume with EFS (AWS), Filestore (GCP), or any NFS mount, mounted at `/data` on both backend and worker containers.
- **Reverse-proxy in front of multiple backends**: Nginx `upstream` block with `least_conn`, or use AWS ALB / Cloudflare Load Balancer. Sessions are stateless (job state lives in Redis + disk), so no sticky sessions are needed.
- **Rate limiting**: `slowapi` is wired into FastAPI (`app/main.py`); add `@limiter.limit("30/minute")` to specific routes if you expect public traffic.
- **Job retention**: a future cron should clean up `/data/jobs/*` older than `JOB_TTL_HOURS`. A simple addition:
  ```bash
  # Add to crontab on the host
  0 * * * * find /var/lib/docker/volumes/editease_editease_data/_data/jobs -mindepth 1 -maxdepth 1 -mtime +3 -exec rm -rf {} +
  ```

### 4d. Backups

The only stateful data is the `editease_data` Docker volume (`/data` inside containers). Snapshot it:

```bash
docker run --rm -v editease_editease_data:/data -v $PWD:/backup alpine \
    tar czf /backup/editease-data-$(date +%F).tar.gz -C /data .
```

Schedule via cron and copy off-box to S3 / R2 / GCS.

### 4e. Observability

- `/api/health` — quick liveness endpoint that also reports whether `cas-offinder` and `RNAfold` binaries are present.
- Flower dashboard (Celery): `docker compose --profile monitoring up -d flower` → http://localhost:5555.
- Logs: `docker compose logs -f` or wire to your provider (Datadog, Logtail, CloudWatch Logs driver).

---

## API reference

| Method | Endpoint | What |
|---|---|---|
| GET  | `/api/health` | Service + tool availability |
| POST | `/api/retrieve` | Submit retrieval job |
| POST | `/api/promoter/analyze` | Submit promoter analysis (FASTA or chained job_id) |
| POST | `/api/sgrna/design` | Submit sgRNA design |
| GET  | `/api/jobs/{id}` | Job status + result |
| GET  | `/api/jobs/{id}/files` | List output files |
| GET  | `/api/jobs/{id}/download/{path}` | Download a specific file |

Full interactive docs at `/docs`.

### Sample requests

```bash
# Health
curl http://localhost:8000/api/health

# Retrieve Arabidopsis AT1G01010 promoter (2 kb upstream)
curl -X POST http://localhost:8000/api/retrieve \
  -H "Content-Type: application/json" \
  -d '{"source":"ensembl_plants","query":"AT1G01010",
       "species":"arabidopsis_thaliana","upstream_bp":2000,
       "downstream_bp":0,"region":"promoter"}'

# Chain promoter analysis to that retrieval job
curl -X POST http://localhost:8000/api/promoter/analyze \
  -H "Content-Type: application/json" \
  -d '{"job_id_input":"<retrieval-job-id>",
       "databases":["plantcare","plantpan"],"min_score":0.75}'

# Design sgRNAs from inline FASTA
curl -X POST http://localhost:8000/api/sgrna/design \
  -H "Content-Type: application/json" \
  -d '{"fasta_text":">target\nATGCGATCGATCGATCGATCGAGG...",
       "pam":"NGG","guide_length":20,
       "max_mismatches":3,"top_n":10}'

# Poll status
curl http://localhost:8000/api/jobs/<job-id>

# Download an output
curl -O http://localhost:8000/api/jobs/<job-id>/download/sgrna_results.csv
```

The full end-to-end flow as a script: `./scripts/sample_requests.sh`.

---

## Notes on tool integration

- **PlantCARE / PlantPAN**: neither offers a stable public API for batch use. EditEase ships a curated motif library (`backend/app/tools/cis_motifs.py`) covering the well-known plant cis-elements and TF binding sites from both databases. To swap in the official PlantCARE matrix file, replace the list in that module — the scanner is database-agnostic.
- **CHOPCHOP**: implemented locally as PAM-aware enumeration + a Doench-2016-style efficiency heuristic. To use the upstream CHOPCHOP CLI, install it (`pip install chopchop` is not official; clone https://chopchop.cbu.uib.no/ source) and shell out from `services/sgrna.py`.
- **Cas-OFFinder**: real CLI is built into the backend Docker image. If you run without Docker and the binary isn't on `$PATH`, EditEase uses a fallback Python k-mismatch scanner (slower; suitable for small reference sets).
- **RNAfold (ViennaRNA)**: real CLI in the Docker image. Without it, a heuristic GC-pair / palindromicity estimator is used.
- **TBtools**: per the spec, no direct integration. Visualizations are recreated with matplotlib (PNG/SVG/PDF) and Plotly (interactive HTML).

---

## License

MIT.
