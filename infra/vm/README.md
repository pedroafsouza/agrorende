# Phase 1 VM hosting

This guide covers **Phase 1** only: one Linux VM per environment in São Paulo, running the
AgroRende containers with Docker Compose (ARCHITECTURE §18.3). The Phase 2 scale-out resources are
listed separately in [`infra/aws/README.md`](../aws/README.md) and are not used in Phase 1.

| Environment | VM size | Database | Hostnames |
|---|---|---|---|
| staging | 2 vCPU, 4 GB RAM, 50 GB disk | `mongo:8` single-node replica set on the VM (compose profile `staging`) | `staging.agrorende.com.br`, `app.staging.agrorende.com.br`, `ws.staging.agrorende.com.br` |
| production | 4 vCPU, 8 GB RAM, 200 GB gp3 disk | MongoDB Atlas M10 on AWS `sa-east-1` (`mongodb+srv://`) | `agrorende.com.br`, `app.agrorende.com.br`, `ws.agrorende.com.br` |

The VM runs these services, all defined in `infra/compose/app.yml` and `infra/compose/vm.yml`:
`caddy` (the only service with published ports: 80 and 443), `web`, `realtime`, `worker`,
`redis`, `backup`, the one-off `migrate` job and, on staging only, `mongo`. The OIDC mock used for
local runs and end-to-end tests is never deployed.

All deploys go through `.github/workflows/deploy.yml`; see [`docs/RELEASING.md`](../../docs/RELEASING.md).
Nobody runs `docker compose up` on the VM by hand except during an incident, and then only with
the files and `.env` that the last deploy wrote.

## 1. Provision the VM

Use Ubuntu Server 24.04 LTS (arm64 or amd64; the images are built for the runner architecture, so
use amd64 unless `release.yml` is changed to build both). In AWS this is an EC2 instance in
`sa-east-1` with an Elastic IP; any São Paulo provider works.

1. Attach a separate data volume for `/srv/agrorende` (production 200 GB gp3, staging 50 GB) and
   enable daily volume snapshots kept for 7 days.
2. Point the DNS `A`/`AAAA` records of `SITE_HOST`, `www.SITE_HOST`, `APP_HOST` and `WS_HOST` at
   the VM before the first deploy, so Caddy can obtain certificates.

### Firewall: 22, 80 and 443 only

Open only SSH (22, ideally limited to the GitHub Actions IP ranges and the operators' addresses),
HTTP (80) and HTTPS (443 TCP and UDP for HTTP/3). In AWS use a security group with exactly these
rules; on the host also enable `ufw`:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Docker publishes ports through its own iptables rules and bypasses `ufw`. That is why only Caddy
publishes ports in `vm.yml`: `web`, `realtime`, `worker`, `redis` and `mongo` are reachable only on
the internal compose network. Keep it that way.

### Unattended upgrades and swap

```bash
sudo apt-get update && sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 2 GB swap on staging, 4 GB on production, as a guard against memory spikes during image pulls.
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-agrorende.conf && sudo sysctl --system
```

### Docker Engine and Compose v2

Install Docker Engine and the Compose plugin from Docker's apt repository
(<https://docs.docker.com/engine/install/ubuntu/>). `vm.yml` uses the `!reset` and `!override`
tags, which need **Docker Compose 2.24.4 or newer**:

```bash
docker compose version   # must print v2.24.4 or newer
```

### Deploy user

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# Paste the public half of the DEPLOY_SSH_KEY secret:
sudo tee /home/deploy/.ssh/authorized_keys > /dev/null
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Disable password login in `/etc/ssh/sshd_config` (`PasswordAuthentication no`,
`PermitRootLogin no`) and restart `ssh`. Membership of the `docker` group is equivalent to root on
the host; the deploy key is therefore an environment secret protected by the GitHub Environment
rules. Record the host key for the `DEPLOY_KNOWN_HOSTS` secret from a trusted machine:

```bash
ssh-keyscan -t ed25519 <vm address>
```

### Media disk and the `/srv/agrorende` layout

Mount the data volume at `/srv/agrorende` (add it to `/etc/fstab` by UUID), then create the
folders. The app containers run as uid 1000 (`node`) and the backup container as uid 1000
(`ubuntu`), so the media folder belongs to uid 1000:

```bash
sudo install -d -o deploy -g deploy -m 755 /srv/agrorende /srv/agrorende/site /srv/agrorende/restore
sudo install -d -o 1000 -g 1000 -m 750 /srv/agrorende/media
sudo install -d -m 700 /srv/agrorende/caddy /srv/agrorende/caddy/data /srv/agrorende/caddy/config
sudo install -d -m 700 /srv/agrorende/redis
sudo install -d -m 700 /srv/agrorende/mongo   # staging only
sudo chown 1000:1000 /srv/agrorende/restore
```

| Path | Contents | Written by |
|---|---|---|
| `/srv/agrorende/app.yml`, `vm.yml`, `Caddyfile` | Compose and Caddy configuration | `deploy.yml` (copied from the deployed commit) |
| `/srv/agrorende/.env` | Environment, mode 600 | `deploy.yml` (rendered from the GitHub Environment) |
| `/srv/agrorende/media` | Media files (`MEDIA_ROOT` = `/data/media` in `web` and `worker`) | the app |
| `/srv/agrorende/site` | Public site build | `deploy.yml` |
| `/srv/agrorende/caddy` | Certificates and Caddy state | Caddy |
| `/srv/agrorende/redis` | Redis append-only file (BullMQ queues) | Redis |
| `/srv/agrorende/mongo` | Staging database files | MongoDB (staging only) |
| `/srv/agrorende/restore` | Restic restore target | the backup container |

If the uid of the `deploy` user is not 1000, keep the media folder owned by 1000 anyway; the
containers set `user: "1000:1000"` explicitly.

## 2. Restic repository

Backups go to an off-site restic repository, for example an S3 bucket in a different AWS account
or region (`s3:s3.us-east-1.amazonaws.com/agrorende-backups-<env>`), with credentials limited to
that bucket. Put `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `RESTIC_AWS_ACCESS_KEY_ID` and
`RESTIC_AWS_SECRET_ACCESS_KEY` in the GitHub Environment (see `docs/RELEASING.md`). **Store
`RESTIC_PASSWORD` in the team password manager as well: without it the backups cannot be read.**

After the first deploy, initialise the repository once:

```bash
cd /srv/agrorende
docker compose -f app.yml -f vm.yml run --rm backup init
docker compose -f app.yml -f vm.yml run --rm backup backup
docker compose -f app.yml -f vm.yml run --rm backup snapshots
```

The `backup` service then takes a snapshot every night at `BACKUP_HOUR` (São Paulo time) of
`/srv/agrorende/media` (temporary upload folders excluded) and, on staging, of a
`mongodump --archive --gzip` of the VM database. It keeps 30 daily and 12 monthly snapshots and
logs to the container log (`docker compose -f app.yml -f vm.yml logs backup`). Production database
backups are Atlas continuous backup with point-in-time recovery, not restic.

## 3. Restore drill (monthly)

Run a restore drill every month and record the date and result in `docs/RUNBOOK.md`. Restores
never write in place: files go to `/srv/agrorende/restore`, and a person copies them back after
checking them.

```bash
cd /srv/agrorende
docker compose -f app.yml -f vm.yml run --rm backup snapshots
docker compose -f app.yml -f vm.yml run --rm backup check

# One media file (paths inside the snapshot start with /data/media):
docker compose -f app.yml -f vm.yml run --rm backup restore latest /data/media/<media key>
ls -l /srv/agrorende/restore/data/media/
cmp /srv/agrorende/restore/data/media/<media key> /srv/agrorende/media/<media key>

# Staging database, into a scratch database name (never over the live one):
docker compose -f app.yml -f vm.yml run --rm -T backup restore-mongo latest \
  | docker compose -f app.yml -f vm.yml exec -T mongo \
      mongorestore --archive --gzip --nsFrom 'agrorende.*' --nsTo 'agrorende_restore.*'
docker compose -f app.yml -f vm.yml exec mongo mongosh --quiet --eval \
  'db.getSiblingDB("agrorende_restore").assets.countDocuments()'
docker compose -f app.yml -f vm.yml exec mongo mongosh --quiet --eval \
  'db.getSiblingDB("agrorende_restore").dropDatabase()'
rm -rf /srv/agrorende/restore/*
```

T18 ran the same drill against a local restic repository; the commands and output are in
`docs/progress/T18.md`.

## 4. Monitoring

- **Uptime:** an external uptime check (for example Better Stack, UptimeRobot or AWS Route 53
  health checks) on `https://APP_HOST/api/v1/health` and `https://WS_HOST/health` every minute,
  alerting the on-call channel. `/api/v1/health` fails when MongoDB is unreachable or the media
  folder is not writable.
- **Errors:** Sentry, with `SENTRY_DSN` in the environment; the Sentry environment is `APP_ENV`.
- **Disk:** alert at 70 % on `/srv/agrorende` and `/` (CloudWatch agent `disk_used_percent`, or a
  cron job that posts to the alert channel). Grow the volume online first; S3 media is the Phase 2
  trigger.
- **Containers:** `docker compose -f app.yml -f vm.yml ps` shows health; logs rotate at 20 MB × 5
  files per container (`json-file`).
- **Backups:** check the `backup` log after each night; a night without a "media snapshot finished"
  line (and, on staging, "database snapshot finished"), or any "backup failed" line, is an incident.

## 5. Useful commands on the VM

```bash
cd /srv/agrorende
docker compose -f app.yml -f vm.yml ps
docker compose -f app.yml -f vm.yml logs --since 30m web
docker compose -f app.yml -f vm.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
grep '^IMAGE_TAG=' .env          # the tag that is running
```

Staging needs `COMPOSE_PROFILES=staging`; `deploy.yml` writes it into the staging `.env`, so the
commands above are the same on both environments.
