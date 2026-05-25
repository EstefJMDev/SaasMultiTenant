# Ollama Setup - Local LLM for Agent System

This guide explains how to run the agent system with a local model via Ollama instead of the Anthropic Claude API.

## Why Ollama?

- No API key required
- No external API calls - everything runs on your machine
- No per-token costs
- Full data privacy - nothing leaves your network
- Works offline after initial model download

## Prerequisites

- 8GB+ RAM (16GB recommended for larger models)
- ~5GB disk space for the model
- Node.js 18+
- PostgreSQL 12+

## Step 1: Install Ollama

Download from [ollama.ai](https://ollama.ai) or use the command line:

### macOS / Linux
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Windows
Download the installer from https://ollama.ai/download/windows

## Step 2: Pull the Model

```bash
ollama pull mistral:7b
```

This downloads the model (~4.1GB). It only needs to happen once.

### Alternative Models

You can use any Ollama model that supports tool/function calling:

| Model | Size | Notes |
|-------|------|-------|
| `mistral:7b` | ~4.1GB | Default. Good balance of speed and quality |
| `llama3.1:8b` | ~4.7GB | Strong general reasoning |
| `qwen2.5:7b` | ~4.4GB | Good multilingual support |
| `mistral-nemo:12b` | ~7.1GB | Better quality, needs more RAM |
| `llama3.1:70b` | ~40GB | Best quality, needs 64GB+ RAM |

To switch models, update `OLLAMA_MODEL` in your `.env` file.

## Step 3: Start Ollama

```bash
ollama serve
```

Ollama runs on `http://localhost:11434` by default. On macOS and Windows, the Ollama app starts the server automatically.

### Verify It's Running

```bash
curl http://localhost:11434/api/tags
```

You should see a JSON response listing your downloaded models.

## Step 4: Configure the Agent System

```bash
cd agent-system
cp .env.example .env
```

Edit `.env` -- the defaults already point to Ollama:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b
```

## Step 5: Start the Agent System

```bash
npm install
npm run build
npm start
```

Or in development mode:

```bash
npm run dev
```

## Step 6: Test

```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "List all invoices"
  }'
```

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | `ollama` for local, `anthropic` for cloud |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `mistral:7b` | Model name (must be pulled first) |
| `OLLAMA_TIMEOUT_MS` | `120000` | Request timeout in ms |
| `OLLAMA_NUM_CTX` | `8192` | Context window size |
| `OLLAMA_TEMPERATURE` | `0.1` | Sampling temperature (lower = more deterministic) |

## Troubleshooting

### "Cannot connect to Ollama"

Make sure Ollama is running:
```bash
ollama serve
```

Or check if it is already running:
```bash
curl http://localhost:11434/api/tags
```

### "Model not found"

Pull the model first:
```bash
ollama pull mistral:7b
```

### Slow responses

- First request after starting Ollama loads the model into memory (can take 10-30s)
- Subsequent requests are faster
- Increase `OLLAMA_NUM_CTX` for longer conversations (uses more RAM)
- Use a smaller model if your hardware is limited

### Out of memory

- Use a smaller model (e.g., `mistral:7b` instead of a 13B+ model)
- Reduce `OLLAMA_NUM_CTX` to 4096
- Close other memory-intensive applications

### Tool calls not working

Some models have limited or no tool-calling support. The client includes a fallback parser that extracts tool calls from text. If a model consistently fails to call tools:
- Switch to `mistral:7b` or `llama3.1:8b` which have good tool support
- Check Ollama logs for errors: `ollama logs`

## Switching Back to Anthropic

To use Claude API instead:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
CLAUDE_MODEL=claude-sonnet-4-20250514
```

Install the optional SDK:
```bash
npm install @anthropic-ai/sdk
```

Both providers use the same orchestrator logic, tools, confirmations, and audit trail.
