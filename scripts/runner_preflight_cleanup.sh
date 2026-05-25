#!/usr/bin/env bash
set -euo pipefail

RUNNER_ROOT="${RUNNER_ROOT:-/opt/actions-runner-erp}"
PROJECT_ROOT="${PROJECT_ROOT:-/home/server/projects/erp}"

run_root() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@" 2>/dev/null || "$@"
  else
    "$@"
  fi
}

echo "[cleanup] Disk before:"
df -h || true
df -i || true

echo "[cleanup] Purging old runner diagnostics..."
run_root find "$RUNNER_ROOT/_diag" -type f -name "*.log" -mtime +2 -delete 2>/dev/null || true

echo "[cleanup] Purging stale runner work temp..."
run_root find "$RUNNER_ROOT/_work/_temp" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true

echo "[cleanup] Purging project tmp logs..."
run_root find "$PROJECT_ROOT" -maxdepth 1 -type f -name "tmp-agent-log*.txt" -delete 2>/dev/null || true

echo "[cleanup] Eliminando imagenes antiguas no usadas (infra-* obsoletas)..."
# Estas imagenes fueron creadas antes de renombrar el proyecto compose a saas-*.
# Ocupan ~8.6GB y ya no las usa ningun servicio activo.
docker rmi infra-backend-fastapi:latest infra-celery-worker:latest infra-celery-beat:latest 2>/dev/null || true

echo "[cleanup] Pruning Docker (dangling images, stopped containers, unused networks, unused volumes)..."
docker container prune -f >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
docker volume prune -f >/dev/null 2>&1 || true
docker network prune -f >/dev/null 2>&1 || true

echo "[cleanup] Journal vacuum (best effort)..."
run_root journalctl --vacuum-time=7d >/dev/null 2>&1 || true

echo "[cleanup] Disk after:"
df -h || true
df -i || true

