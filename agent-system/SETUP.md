# Agent System - Setup Guía Completa

## Requisitos Previos

- **Node.js 18+** instalado
- **PostgreSQL 12+** instalado y corriendo
- **Tu FastAPI backend** corriendo en `http://localhost:8000`
- **Ollama** instalado con un modelo descargado (ver [OLLAMA_SETUP.md](OLLAMA_SETUP.md))
  - O bien **Anthropic API key** de https://console.anthropic.com (opcional, para usar Claude en la nube)

## 📋 Paso 1: Preparar PostgreSQL

### Crear Usuario y Base de Datos

```bash
# Conectar a PostgreSQL como admin
psql -U postgres

# Dentro de psql, ejecutar:
CREATE USER agent_user WITH PASSWORD 'secure_password';
CREATE DATABASE saas_agents OWNER agent_user;
GRANT ALL PRIVILEGES ON DATABASE saas_agents TO agent_user;

# Salir
\q
```

### Verificar Conexión

```bash
psql -h localhost -U agent_user -d saas_agents
# Debería conectar sin pedir contraseña si todo está bien
\q
```

## 🔧 Paso 2: Configurar Agent System

### Clonar/Crear Carpeta
```bash
# Ya existe en agent-system/
cd agent-system
```

### Instalar Dependencias
```bash
npm install
```

### Configurar Variables de Entorno
```bash
cp .env.example .env
```

Editar `.env` con tus valores reales:

```env
# Proveedor LLM: "ollama" (local, por defecto) o "anthropic" (nube)
LLM_PROVIDER=ollama

# Ollama (local - no necesita API key)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b

# Anthropic (solo si LLM_PROVIDER=anthropic)
# ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
# CLAUDE_MODEL=claude-sonnet-4-20250514

PORT=3000

# Tu Backend FastAPI
FASTAPI_BASE_URL=http://localhost:8000
FASTAPI_API_KEY=tu-jwt-token-aqui

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=saas_agents
DB_USER=agent_user
DB_PASSWORD=secure_password
DB_SSL=false
DB_POOL_MAX=20
DB_POOL_MIN=2

# Configuración
SESSION_TTL_MINUTES=30
CONFIRMATION_EXPIRY_MINUTES=5
MAX_AGENT_LOOP_ROUNDS=15
API_TIMEOUT_MS=15000
API_MAX_RETRIES=3

# Logging
LOG_LEVEL=info
DEBUG_API_CALLS=false
LOG_API_REQUESTS=true
```

## 🏗️ Paso 3: Construir y Ejecutar

### Compilar TypeScript
```bash
npm run build
```

### Iniciar Servidor
```bash
npm start
# O en desarrollo con auto-reload:
npm run dev
```

Deberías ver:
```
[INFO] Agent System running on http://localhost:3000
[INFO] POST /agent/chat - Chat with agents
[INFO] Database initialized successfully
```

## ✅ Paso 4: Verificar que Funciona

### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

**Resultado esperado:**
```json
{
  "status": "ok",
  "timestamp": "2025-03-26T...",
  "database": "connected"
}
```

### Test 2: Chat Simple (Read Operation)
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "1",
    "message": "List all invoices"
  }'
```

**Resultado esperado:**
- ✅ Se conecta a tu FastAPI backend
- ✅ Obtiene facturas reales
- ✅ Retorna respuesta del agente

### Test 3: Chat con Confirmación (Write Operation)
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "1",
    "message": "Update the Q1 budget to $50000"
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "confirmationRequired": true,
  "confirmationId": "conf-xxx",
  "action": {
    "description": "Update Q1 budget to $50000"
  }
}
```

### Test 4: Confirmar Acción
```bash
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xxx",
    "userId": "user123"
  }'
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Action confirmed and executed",
  "data": { /* resultado de la actualización */ }
}
```

## 🔍 Verificar Base de Datos

### Ver Tablas Creadas
```bash
psql -h localhost -U agent_user -d saas_agents

# Ver estructura
\dt

# Ver logs
SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 5;

# Ver confirmaciones pendientes
SELECT * FROM confirmation_requests WHERE confirmed = false;
```

## 🚀 Solucionar Problemas

### Error: "Database connection failed"
```bash
# Verificar PostgreSQL está corriendo
psql -U postgres

# Verificar credenciales en .env
# Asegurarse que DB_PASSWORD es correcto
```

### Error: "FASTAPI_BASE_URL unreachable"
```bash
# Verificar FastAPI está corriendo
curl http://localhost:8000/docs

# Actualizar FASTAPI_BASE_URL en .env si es diferente
```

### Error: "Cannot connect to Ollama"
```bash
# Verificar que Ollama esta corriendo
ollama serve

# Verificar que el modelo esta descargado
ollama pull mistral:7b

# Probar conexion
curl http://localhost:11434/api/tags
```

### Error: "API_KEY invalid" (solo si usas Anthropic)
```bash
# Verificar que ANTHROPIC_API_KEY es valido en console.anthropic.com
# La clave debe empezar con sk-ant-
```

### Error: "tenant_id invalid"
```bash
# Verificar que el tenantId (1, 2, etc) existe en tu backend
# O usar un UUID válido si tu backend usa UUIDs
```

### Error: "Tool execution failed"
```bash
# Revisar logs
tail -f /tmp/agent-system.log

# Verificar que los endpoints FastAPI existen:
curl http://localhost:8000/api/v1/invoices?tenant_id=1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 Monitorear en Desarrollo

### Ver Logs en Tiempo Real
```bash
# Terminal 1: Ver logs del servidor
npm run dev

# Terminal 2: Ver logs de la base de datos
psql -h localhost -U agent_user -d saas_agents
SELECT * FROM agent_logs ORDER BY created_at DESC;
```

### Usar psql para Debugging
```bash
psql -h localhost -U agent_user -d saas_agents

# Ver sesiones activas
SELECT session_id, user_id, agent_type, COUNT(*)
FROM agent_logs
GROUP BY session_id, user_id, agent_type;

# Ver acciones requiriendo confirmación
SELECT id, user_id, tool_name, confirmed_by, confirmed_at
FROM agent_logs
WHERE requires_confirmation = true
ORDER BY created_at DESC;

# Ver intentos fallidos
SELECT user_id, agent_type, tool_name, result
FROM agent_logs
WHERE result LIKE '%error%' OR result LIKE '%failed%'
ORDER BY created_at DESC LIMIT 10;
```

## 🐳 Deployment con Docker (Opcional)

### Docker Compose
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: saas_agents
      POSTGRES_USER: agent_user
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  agent-system:
    build: .
    environment:
      LLM_PROVIDER: ollama
      OLLAMA_BASE_URL: http://host.docker.internal:11434
      OLLAMA_MODEL: mistral:7b
      FASTAPI_BASE_URL: http://host.docker.internal:8000
      FASTAPI_API_KEY: ${FASTAPI_API_KEY}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: saas_agents
      DB_USER: agent_user
      DB_PASSWORD: secure_password
      NODE_ENV: development
    ports:
      - "3000:3000"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

```bash
docker-compose up
```

## 📈 Performance Tuning

### Para Producción

1. **Connection Pooling**
   ```env
   DB_POOL_MIN=5
   DB_POOL_MAX=30
   ```

2. **Timeouts**
   ```env
   API_TIMEOUT_MS=20000
   API_MAX_RETRIES=2
   ```

3. **Logging**
   ```env
   LOG_LEVEL=warn
   LOG_API_REQUESTS=false
   DEBUG_API_CALLS=false
   ```

### Monitorear Performance

```sql
-- Queries más lentas
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

-- Tamaño de tablas
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

## 🔐 Producción - Checklist

- [ ] Cambiar contraseña de PostgreSQL
- [ ] Usar JWT token real para FastAPI
- [ ] Configurar HTTPS en Express
- [ ] Agregar rate limiting
- [ ] Configurar backups de PostgreSQL
- [ ] Monitoreo con Datadog/Prometheus
- [ ] Alertas configuradas
- [ ] Logs centralizados
- [ ] SSL en conexión a PostgreSQL
- [ ] Auditoría habilitada

## 📞 Soporte

Si algo no funciona:

1. Revisa los logs: `npm run dev`
2. Verifica `.env` tiene todos los valores
3. Prueba conectar a cada servicio por separado
4. Revisa PostgreSQL: `psql -U agent_user -d saas_agents`
5. Prueba API FastAPI: `curl http://localhost:8000/health`
6. Verifica API key Anthropic en console.anthropic.com

---

**¡Listo! Tu Agent System debería estar 100% funcional.** 🎉
