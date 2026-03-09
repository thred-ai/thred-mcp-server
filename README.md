# Thred MCP Server

An MCP (Model Context Protocol) server that gives AI assistants access to Thred conversation transcripts and customer insights. Deployed to Google Cloud Run — users connect remotely with their own Thred API key.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_transcript_by_email` | Get the full conversation transcript for a customer by email |
| `get_transcript_by_id` | Get the full conversation transcript for a customer by ID |
| `get_customer_insights` | Get buying signals, concerns, competitors, and suggestions |
| `check_backend_health` | Verify the Thred backend is reachable |

## For End Users

Connect your MCP client to the hosted server. You'll need your Thred API key.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thred": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://thred-mcp-xxxxx-uc.a.run.app/mcp",
        "--header",
        "Authorization: Bearer YOUR_THRED_API_KEY"
      ]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "thred": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://thred-mcp-xxxxx-uc.a.run.app/mcp",
        "--header",
        "Authorization: Bearer YOUR_THRED_API_KEY"
      ]
    }
  }
}
```

### Other MCP Clients (Windsurf, Continue, Cline, etc.)

Same pattern — point at the remote URL and pass your API key via the `Authorization` header.

---

## Development

### Local Setup

```bash
npm install
npm run build
```

### Local Testing (stdio mode)

For development, run the server locally in stdio mode with your API key:

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "thred": {
      "command": "node",
      "args": ["/absolute/path/to/thred-mcp/dist/index.js"],
      "env": {
        "THRED_API_KEY": "your-api-key",
        "THRED_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

This requires the `thred-attribution-backend` to be running locally.

### Deployment

Deployment happens automatically on push to `main` via GitHub Actions → Cloud Build → Cloud Run.

**GCP Secret Manager** (create once):

```bash
gcloud secrets create thred-mcp-base-url --replication-policy="automatic"
echo -n "https://your-backend-cloud-run-url" | gcloud secrets versions add thred-mcp-base-url --data-file=-
```

**GitHub Secrets** (set in repo settings):

| Secret | Value |
|--------|-------|
| `GCP_SA_KEY` | GCP service account JSON key |
| `GCP_PROJECT_ID` | Your GCP project ID |

### Architecture

| Mode | Transport | API Key Source | Used By |
|------|-----------|---------------|---------|
| `TRANSPORT=stdio` | stdio | `THRED_API_KEY` env var | Local dev/testing |
| `TRANSPORT=http` | Streamable HTTP | `Authorization: Bearer <key>` header | Cloud Run (end users) |
