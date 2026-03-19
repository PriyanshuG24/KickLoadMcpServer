# KickLoad MCP Remote Server

A remote MCP (Model Context Protocol) server for KickLoad load testing service with intelligent parameter scaling.

## Features

- **MCP Protocol Support**: Full MCP server using @modelcontextprotocol/sdk
- **Intelligent Scaling**: Auto-adjusts parameters based on user count
- **Smart Thresholds**: Claude automatically generates performance thresholds
- **TypeScript**: Fully typed with Zod validation

## Quick Start

### Prerequisites

- Node.js 18+ 
- KickLoad API token

### Installation

```bash
git clone <repository-url>
cd kickload-mcp-remote
npm install
cp .env.example .env
npm run build
npm start
```

Server starts on `http://localhost:3000`

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "kickload": {
      "disabled": false,
      "headers": {
        "Authorization": "Bearer mcp_server_secret",
        "X-Api-Token": "your_api_token_here"
      },
      "url": "https://your-server-url.com/mcp"
    }
  }
}
```

## MCP Tools

### generate_test_plan
Generate JMeter test plan from description or upload existing JMX.

```javascript
{
  "method": "generate_test_plan",
  "params": {
    "prompt": "Test POST https://api.example.com/login with 100 users for 60 seconds"
  }
}
```

### run_load_test
Execute load test with intelligent parameter scaling.

```javascript
{
  "method": "run_load_test",
  "params": {
    "jmx_filename": "test-plan.jmx",
    "num_threads": 100,        // Concurrent users
    "ramp_time": 30,           // Ramp up time (seconds)
    "duration": 60,            // Test duration (seconds)
    "loop_count": 1,           // Loops per thread
    "specify_thread_lifetime": false,
    "startup_delay": 0
  }
}
```

**Auto-scaling based on user count:**
- 1-10 users: Light load
- 50-100 users: Medium load  
- 500+ users: Heavy load
- 1000+ users: Stress test

### get_results
Analyze load test results with threshold validation.

```javascript
{
  "method": "get_results",
  "params": {
    "task_id": "task_12345",
    "thresholds": {
      "error_rate_pct": 5,         // Max error rate %
      "min_throughput_rps": 50     // Min throughput (req/s)
    }
  }
}
```

## Development

### Scripts

- `npm run dev` - Development server
- `npm run build` - Build TypeScript
- `npm start` - Production server
- `npm run test` - Run demo workflow

### Test Workflow

```bash
npx tsx test-workflow.js
```

Demo runs: generate plan → execute test → analyze results

### Project Structure

```
kickload-mcp-remote/
├── public/
│   └── index.html            # Setup page
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── config.ts             # Environment configuration
│   ├── types.ts              # TypeScript interfaces
│   ├── routes/
│   │   ├── mcp.ts            # MCP endpoint implementation
│   │   └── verify.ts         # Token verification
│   ├── tools/
│   │   ├── generatePlan.ts   # Test plan generation
│   │   ├── runLoadTest.ts    # Load test execution
│   │   ├── getResults.ts     # Results analysis
│   │   └── pdfExtractor.ts   # PDF report extraction
│   └── lib/
│       └── kickloadClient.ts # HTTP client for KickLoad API
├── test-workflow.js          # Demo test script
├── .env.example              # Environment template
├── Dockerfile                # Container configuration
└── package.json              # Dependencies and scripts
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `KICKLOAD_BASE_URL` | `https://api.neeyatai.com` | API base URL |
| `NODE_ENV` | ` development` | Node Environment |
| `MCP_SERVER_SECRET` | `mcp_server_secret` | MCP server secret |

## How Claude Uses This Server

**User**: "Test POST https://api.myapp.com/login with data for 800 users"

**Claude automatically**:
1. Extracts URL, method, data, user count
2. Generates test plan
3. Scales parameters (800 threads, 4min ramp, 6min duration)
4. Sets appropriate thresholds
5. Executes and analyzes results

## Security

- Token validation before configuration
- Tokens stored only in Claude Desktop
- Server acts as proxy, doesn't persist tokens
- Use HTTPS in production
