# Phase 2 AWS resources (scale-out reference)

This file is **only a resource list** for Phase 2 (ARCHITECTURE §18.3). Nothing here is provisioned
in Phase 1, and agents do not write Terraform or CDK for it: infrastructure as code for Phase 2 is
owned by humans. Phase 1 operations (the single VM per environment, Compose, Caddy, restic) are in
[`infra/vm/README.md`](../vm/README.md).

Move to Phase 2 when one of these triggers holds: availability target above 99.5 %, more than 200
organisations or 3 000 users, a second app host is needed, media above 500 GB, disk above 70 % after
one resize, or several organisations with SLAs.

All resources live in `sa-east-1` (São Paulo) unless noted, one set per environment (`staging`,
`production`).

## Network

| Resource | Notes |
|---|---|
| VPC | Two or three Availability Zones; public subnets for the ALB and NAT, private subnets for tasks and ElastiCache |
| NAT gateway | One per AZ in production (one shared in staging) for outbound traffic: Atlas, Google, Apple, Expo push, Sentry |
| VPC endpoints | S3 (gateway), ECR, Secrets Manager, CloudWatch Logs (interface) to keep traffic private |
| Security groups | ALB: 443 from the internet; services: only from the ALB; ElastiCache: only from the services |
| Atlas network peering or PrivateLink | Private connection from the VPC to the Atlas cluster; the Atlas IP access list then holds no public ranges |

## Edge

| Resource | Notes |
|---|---|
| Route 53 hosted zone | `agrorende.com.br`: apex and `www` (site), `app` (web), `ws` (realtime); staging uses `staging.`, `app.staging.`, `ws.staging.` |
| ACM certificates | For the ALB (and in `us-east-1` for CloudFront) |
| Application Load Balancer | Host rules: `APP_HOST` → web target group (health `/api/v1/health`), `WS_HOST` → realtime target group (health `/health`, idle timeout raised for WebSocket); no sticky sessions, because realtime uses `transports: ["websocket"]` and the Redis adapter |
| CloudFront + S3 (site) | Static public site with long cache for assets and no-cache for HTML; optionally CloudFront for signed media downloads |
| AWS WAF (optional) | Managed rule groups and rate limiting on the ALB |

## Compute

| Resource | Notes |
|---|---|
| ECS cluster (Fargate) | One cluster per environment |
| ECS service `web` | 2+ tasks from the `agrorende-web` image, autoscaling on CPU and request count |
| ECS service `realtime` | 2+ tasks from the `agrorende-realtime` image; Socket.IO Redis adapter fans out events |
| ECS service `worker` | 1+ tasks from the `agrorende-worker` image; BullMQ schedulers are deduplicated in Redis |
| ECS one-off task `migrate` | From the `agrorende-migrate` image (the web image's `migrate` target); `deploy.yml` runs it before rolling the services |
| Container registry | GHCR stays the source of truth; optionally replicate to ECR for pulls inside the VPC |
| CloudWatch log groups | One per service, 30-day retention |

## Data

| Resource | Notes |
|---|---|
| MongoDB Atlas | Tier upgrade M10 → M20/M30 first; `readPreference: "secondaryPreferred"` only for reports and dashboards, never for sync; continuous backup with PITR stays on |
| ElastiCache | Redis OSS or Valkey, Redis 7 compatible, with persistence for BullMQ; Multi-AZ with automatic failover in production |
| S3 media bucket | Private, `MEDIA_DRIVER=s3`, versioning on, CORS for the web origin only (no wildcard), abort incomplete multipart uploads after 1 day, lifecycle to Infrequent Access after 90 days |
| S3 backup bucket | Restic repository for any remaining host backups, in another account or region, with Object Lock where available |

## Secrets, identity and deploy

| Resource | Notes |
|---|---|
| Secrets Manager / SSM Parameter Store | All application secrets listed in `docs/RELEASING.md`; tasks read them at start, never baked into images |
| IAM roles | Task execution role (pull, logs, secrets), one task role per service (worker and web: media bucket only) |
| GitHub OIDC provider and deploy role | `deploy.yml` assumes the role with `aws-actions/configure-aws-credentials`; GitHub holds only role ARNs and non-secret variables, no long-lived AWS keys |

## Observability

| Resource | Notes |
|---|---|
| CloudWatch alarms | ALB 5xx rate, target health, ECS CPU and memory, ElastiCache memory and evictions, NAT errors |
| Sentry | Unchanged from Phase 1 |
| Uptime check | Unchanged from Phase 1: `/api/v1/health` and the realtime `/health` |

## Mobile

Unchanged from Phase 1: store builds and EAS Update channels `preview` and `production`, with
`runtimeVersion` on the fingerprint policy so updates never reach an incompatible binary.
