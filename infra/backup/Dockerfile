# syntax=docker/dockerfile:1
#
# AgroRende backup image (T18, ARCHITECTURE §18.3): restic snapshots of the media folder and, on
# staging, a `mongodump --archive --gzip` of the VM MongoDB, to an off-site restic repository.
# Production database backups are Atlas continuous backup; this image only backs up media there.
#
#   docker build -f infra/backup/Dockerfile -t agrorende-backup infra/backup
#
# mongodump/mongorestore come from the same mongo:8 image the staging database runs (they need the
# Kerberos client libraries of Ubuntu 24.04); restic is the upstream static binary.

ARG MONGO_IMAGE=mongo:8
ARG RESTIC_IMAGE=restic/restic:0.18.1

FROM ${MONGO_IMAGE} AS mongo
FROM ${RESTIC_IMAGE} AS restic

FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata libgssapi-krb5-2 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=mongo /usr/bin/mongodump /usr/bin/mongorestore /usr/local/bin/
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY backup.sh /usr/local/bin/agrorende-backup
RUN chmod 0755 /usr/local/bin/agrorende-backup \
 && mkdir -p /data/media /restore /var/cache/restic \
 && chown -R ubuntu:ubuntu /restore /var/cache/restic
ENV TZ=America/Sao_Paulo \
    RESTIC_CACHE_DIR=/var/cache/restic \
    BACKUP_MEDIA_DIR=/data/media \
    BACKUP_HOUR=3 \
    BACKUP_KEEP_DAILY=30 \
    BACKUP_KEEP_MONTHLY=12
# The ubuntu user (uid 1000) matches the `node` user that owns the media files in the app images.
USER ubuntu
ENTRYPOINT ["/usr/local/bin/agrorende-backup"]
CMD ["schedule"]
