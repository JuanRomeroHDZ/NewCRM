FROM postgres:16-bookworm

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends age ca-certificates python3 tar gzip \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/full_backup /var/backups/full \
    && chown root:root /var/backups/full \
    && chmod 0700 /var/backups/full

COPY backup.py /opt/full_backup/backup.py

WORKDIR /opt/full_backup
ENTRYPOINT ["python3", "/opt/full_backup/backup.py"]
CMD ["--schedule"]
USER root
