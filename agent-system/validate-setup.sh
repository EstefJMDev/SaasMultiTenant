#!/bin/bash

# Agent System Setup Validation Script
# This script validates all dependencies and configuration before running

set -e

echo "🔍 Agent System Setup Validation"
echo "================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Helper functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Node.js
echo "1️⃣  Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    check_pass "Node.js installed: $NODE_VERSION"
else
    check_fail "Node.js not found (required: 18+)"
fi

# 2. npm
echo ""
echo "2️⃣  Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    check_pass "npm installed: $NPM_VERSION"
else
    check_fail "npm not found"
fi

# 3. PostgreSQL
echo ""
echo "3️⃣  Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version)
    check_pass "PostgreSQL installed: $PSQL_VERSION"

    # Try to connect with .env credentials
    if [ -f .env ]; then
        DB_HOST=$(grep DB_HOST .env | cut -d '=' -f 2)
        DB_USER=$(grep DB_USER .env | cut -d '=' -f 2)
        DB_NAME=$(grep DB_NAME .env | cut -d '=' -f 2)

        if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &> /dev/null; then
            check_pass "Can connect to PostgreSQL database"
        else
            check_warn "Cannot connect to PostgreSQL. Check DB credentials in .env"
        fi
    else
        check_warn ".env file not found. Run: cp .env.example .env"
    fi
else
    check_fail "PostgreSQL not found (required)"
fi

# 4. .env file
echo ""
echo "4️⃣  Checking configuration (.env)..."
if [ ! -f .env ]; then
    check_fail ".env file not found"
    check_warn "Run: cp .env.example .env and configure with your values"
else
    check_pass ".env file exists"

    # Check critical variables
    if grep -q "ANTHROPIC_API_KEY=sk-ant-" .env; then
        check_pass "ANTHROPIC_API_KEY configured"
    else
        check_fail "ANTHROPIC_API_KEY not configured in .env"
    fi

    if grep -q "FASTAPI_BASE_URL=" .env; then
        FASTAPI_URL=$(grep FASTAPI_BASE_URL .env | cut -d '=' -f 2)
        check_pass "FASTAPI_BASE_URL set: $FASTAPI_URL"
    else
        check_fail "FASTAPI_BASE_URL not configured"
    fi

    if grep -q "DB_PASSWORD=" .env; then
        check_pass "Database credentials configured"
    else
        check_fail "Database credentials not configured"
    fi
fi

# 5. Dependencies
echo ""
echo "5️⃣  Checking npm dependencies..."
if [ -d node_modules ]; then
    if [ -f node_modules/.package-lock.json ] || [ -f package-lock.json ]; then
        check_pass "Dependencies installed"
    else
        check_warn "node_modules exists but may be incomplete. Run: npm install"
    fi
else
    check_fail "Dependencies not installed"
    check_warn "Run: npm install"
fi

# 6. TypeScript
echo ""
echo "6️⃣  Checking TypeScript..."
if [ -f tsconfig.json ]; then
    check_pass "tsconfig.json found"
else
    check_fail "tsconfig.json not found"
fi

# 7. Source files
echo ""
echo "7️⃣  Checking source files..."
FILES=(
    "src/index.ts"
    "src/orchestrator.ts"
    "src/types/index.ts"
    "src/agents/agentRouter.ts"
    "src/tools/toolDefinitions.ts"
    "src/services/realApiClient.ts"
    "src/services/databaseService.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "Found: $file"
    else
        check_fail "Missing: $file"
    fi
done

# 8. Network connectivity
echo ""
echo "8️⃣  Checking network connectivity..."

if [ -f .env ]; then
    FASTAPI_URL=$(grep FASTAPI_BASE_URL .env | cut -d '=' -f 2)
    if curl -s -f "$FASTAPI_URL/health" &> /dev/null || curl -s -f "$FASTAPI_URL/docs" &> /dev/null; then
        check_pass "FastAPI backend is reachable: $FASTAPI_URL"
    else
        check_warn "FastAPI backend not reachable at $FASTAPI_URL"
        check_warn "Ensure your FastAPI backend is running on that URL"
    fi
fi

# Check internet connectivity (for API calls)
if curl -s -f https://api.anthropic.com/health &> /dev/null 2>&1 || curl -s -I https://www.google.com &> /dev/null 2>&1; then
    check_pass "Internet connectivity available"
else
    check_warn "Internet connectivity may be limited"
fi

# 9. Final Summary
echo ""
echo "================================="
echo "📊 Summary"
echo "================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start the server: npm start"
    echo "2. Test in another terminal: curl http://localhost:3000/health"
    echo "3. See SETUP.md for full instructions"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please fix them before running.${NC}"
    echo ""
    echo "Common fixes:"
    echo "- Install Node.js 18+: https://nodejs.org"
    echo "- Install PostgreSQL: https://www.postgresql.org/download"
    echo "- Copy .env: cp .env.example .env"
    echo "- Configure .env with your API keys and database"
    echo "- Install dependencies: npm install"
    echo "- Run FastAPI backend: python -m uvicorn app.main:app --reload"
    exit 1
fi
