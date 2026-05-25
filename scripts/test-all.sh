#!/usr/bin/env bash
# test-all.sh — Ejecuta todos los tests del proyecto y resume resultados.
# Uso: ./test-all.sh [--backend] [--frontend] [--agent] [--fast]
#   Sin flags: corre todo.
#   --fast: backend solo tests que no requieren red/integraciones externas.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend-fastapi"
FRONTEND="$ROOT/frontend-react"
AGENT="$ROOT/agent-system"

RUN_BACKEND=true
RUN_FRONTEND=true
RUN_AGENT=true
FAST=false

for arg in "$@"; do
  case $arg in
    --backend)  RUN_FRONTEND=false; RUN_AGENT=false ;;
    --frontend) RUN_BACKEND=false;  RUN_AGENT=false ;;
    --agent)    RUN_BACKEND=false;  RUN_FRONTEND=false ;;
    --fast)     FAST=true ;;
  esac
done

PASS=0
FAIL=0
ERRORS=()

run_suite() {
  local name="$1"
  local dir="$2"
  local cmd="$3"
  echo ""
  echo "========================================"
  echo "  $name"
  echo "========================================"
  cd "$dir"
  if eval "$cmd"; then
    echo "[OK] $name"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $name"
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
  fi
  cd "$ROOT"
}

# ── Backend (pytest) ──────────────────────────────────────────────────────────
if $RUN_BACKEND; then
  if $FAST; then
    # Excluye tests de integración con servicios externos
    PYTEST_CMD="python -m pytest tests/ -v \
      --ignore=tests/test_signaturit_integration.py \
      --ignore=tests/test_telegram_integration.py \
      -m 'not integration' \
      --tb=short -q"
  else
    PYTEST_CMD="python -m pytest tests/ -v --tb=short -q"
  fi
  run_suite "Backend (pytest)" "$BACKEND" "$PYTEST_CMD"
fi

# ── Frontend (vitest) ─────────────────────────────────────────────────────────
if $RUN_FRONTEND; then
  run_suite "Frontend (vitest)" "$FRONTEND" "npm run test -- --run"
fi

# ── Agent System (jest) ───────────────────────────────────────────────────────
if $RUN_AGENT; then
  run_suite "Agent System (jest)" "$AGENT" "npm test -- --passWithNoTests"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  RESUMEN"
echo "========================================"
echo "  Suites OK  : $PASS"
echo "  Suites FAIL: $FAIL"
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo "  Fallaron:"
  for e in "${ERRORS[@]}"; do
    echo "    - $e"
  done
  echo ""
  exit 1
fi
echo ""
echo "Todos los tests pasaron."
