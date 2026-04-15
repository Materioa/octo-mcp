# Materio MCP Server

An MCP (Model Context Protocol) server for the **Materio** course materials platform, built with **Bun.js**. Connects to **Perplexity**, **Claude**, and **ChatGPT** to let AI assistants fetch course materials, search topics, and provide study help.

## Architecture

```
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Perplexity  │    │  Claude (API) │    │   ChatGPT     │
│  (Remote MCP) │    │  (Remote MCP) │    │ (Custom GPT)  │
└──────┬────────┘    └──────┬────────┘    └──────┬────────┘
       │  POST /mcp         │  POST /mcp         │  GET /api/*
       └────────────────────┼────────────────────┘
                            │
                  ┌─────────▼──────────┐
                  │  Materio MCP Server │
                  │    (Bun.js)         │
                  │  localhost:3001     │
                  └─────────┬──────────┘
                            │
                  ┌─────────▼──────────┐
                  │  CDN / API Proxy    │
                  │  cdn-materioa.      │
                  │  vercel.app         │
                  └────────────────────┘
```

## Connectors

| Platform     | Protocol          | Endpoint          |
| ------------ | ----------------- | ----------------- |
| **Perplexity** | Remote MCP (Streamable HTTP) | `POST /mcp` |
| **Claude**     | Remote MCP (Streamable HTTP) | `POST /mcp` |
| **ChatGPT**   | Custom GPT Actions (REST)    | `GET /api/*` via `openapi.json` |

## Tools (MCP)

| Tool | Description |
| ---- | ----------- |
| `materio_list_semesters` | List all available semesters |
| `materio_list_subjects` | List subjects for a semester |
| `materio_list_resources` | List all materials for a subject |
| `materio_search` | Search across all materials |
| `materio_get_pdf_url` | Get resolved PDF download URL |
| `materio_get_topic_content` | Get topic context for answering questions |
| `materio_full_index` | Get compact library overview |

## REST Endpoints (for ChatGPT)

| Method | Path                  | Description           |
| ------ | --------------------- | --------------------- |
| GET    | `/api/semesters`      | List semesters        |
| GET    | `/api/subjects`       | List subjects         |
| GET    | `/api/resources`      | List resources        |
| GET    | `/api/search`         | Search materials      |
| GET    | `/api/pdf-url`        | Resolve PDF URL       |
| GET    | `/api/index`          | Full library index    |
| GET    | `/openapi.json`       | OpenAPI spec          |
| GET    | `/health`             | Health check          |

## PDF URL Logic

```
Direct CDN:  https://cdn-materioa.vercel.app/pdfs/{sem}/{subject}/{topic}.pdf
API Proxy:   https://cdn-materioa.vercel.app/api/pdfs/{sem}/{subject}/{topic}.pdf
```

- The server does a HEAD request to the CDN URL
- If the file is **≤ 1 KB** (pointer file) or fails, it switches to the `/api/` proxy URL
- This is handled automatically by `materio_get_pdf_url` and `materio_get_topic_content`

## Quick Start

```bash
# Install dependencies
bun install

# Run in HTTP mode (default) — for Perplexity, Claude, ChatGPT
bun run start

# Run in stdio mode — for Claude Desktop app
TRANSPORT=stdio bun run start

# Dev mode with hot reload
bun run dev
```

## Setup Guides

### Perplexity (Remote MCP)

1. Deploy the server (or use a tunnel like `ngrok` / `cloudflared`)
2. In Perplexity settings, add a custom MCP connector:
   - **URL**: `https://your-server.com/mcp`
   - **Transport**: Streamable HTTP

### Claude (Remote MCP)

1. Deploy the server or tunnel it
2. In Claude settings / API, configure remote MCP:
   - **URL**: `https://your-server.com/mcp`
   - **Transport**: Streamable HTTP

### Claude Desktop (stdio)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "materio": {
      "command": "bun",
      "args": ["run", "c:/Users/Jinansh/Desktop/mcp/src/index.ts"],
      "env": {
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

### ChatGPT (Custom GPT)

1. Deploy the server
2. Create a Custom GPT in ChatGPT
3. Go to **Configure** → **Actions** → **Import from URL**
4. Enter: `https://your-server.com/openapi.json`
5. The GPT will automatically discover all 6 REST endpoints

## Environment Variables

| Variable    | Default | Description                    |
| ----------- | ------- | ------------------------------ |
| `TRANSPORT` | `http`  | `http` or `stdio`              |
| `PORT`      | `3001`  | HTTP server port               |

## Project Structure

```
materio-mcp-server/
├── package.json
├── tsconfig.json
├── openapi.json          # OpenAPI spec for ChatGPT
├── README.md
└── src/
    ├── index.ts           # Main entry — stdio + HTTP transports
    ├── constants.ts       # CDN URLs, thresholds, limits
    ├── types.ts           # TypeScript interfaces
    ├── services/
    │   └── resources.ts   # Fetch, cache, query resource library
    └── tools/
        └── materio.ts     # All 7 MCP tool registrations
```

## License

Private — Materio project.
