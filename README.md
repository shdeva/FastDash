# FastDash Docker Compose

This compose file runs FastDash by cloning the public GitHub repo at container startup and serving it on port `8080`.

## Required Setup

Before deploying, replace the placeholder data path in `docker-compose.yml` with a real persistent directory on your host:

```yaml
volumes:
  - /REPLACE/WITH/YOUR/PERSISTENT/FASTDASH/DATA:/data:rw
```

For example, on TrueNAS SCALE you might create a dataset such as:

```text
/mnt/tank/AppData/FastDash
```

Then update the compose file:

```yaml
volumes:
  - /mnt/tank/AppData/FastDash:/data:rw
```

The container uses `/data` for persistent app data. Future server-side user configuration should be stored under:

```text
/data/config
```

## Permissions

The web server drops privileges and runs as UID/GID `568:568`, the standard TrueNAS Apps user. Make sure your persistent data directory is writable by that user/group.

## Run

```bash
docker compose up -d
```

Open FastDash at:

```text
http://<host>:8080/
```

## Updating

Restarting the container pulls the latest files from the configured GitHub branch:

```bash
docker compose restart
```
