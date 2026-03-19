# KickLoad MCP Remote Server

A remote MCP (Model Context Protocol) server for KickLoad load testing service. This server provides a web interface for setup and exposes MCP endpoints that Claude Code can connect to for load testing functionality.

## Features

- **Web Setup Interface**: Beautiful setup page for token validation and configuration generation
- **MCP Protocol Support**: Full MCP server implementation for Claude Code integration
- **Load Testing Tools**: Generate test plans, run load tests, and analyze results
- **Docker Support**: Ready-to-deploy container for any hosting platform
- **TypeScript**: Fully typed codebase for better development experience

## Quick Start

### Prerequisites

- Node.js 18+ 
- KickLoad API token (get from [KickLoad Dashboard](https://kickload.com))

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd kickload-mcp-remote
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build and run**
   ```bash
   npm run build
   npm start
   ```

The server will start on `http://localhost:3000`

### Using the Web Interface

1. Open `http://localhost:3000` in your browser
2. Enter your KickLoad API token
3. Click "Validate Token & Generate Config"
4. Copy the generated configuration
5. Add it to your Claude Desktop settings file

### Claude Desktop Configuration

Add the generated configuration to your Claude Desktop settings file:

```json
{
  "mcpServers": {
    "kickload-mcp": {
      "command": "npx",
      "args": ["-y", "@kickload/mcp-cli"],
      "env": {
        "KICKLOAD_MCP_URL": "http://localhost:3000/mcp",
        "KICKLOAD_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

## API Endpoints

### Web Interface
- `GET /` - Setup page
- `POST /verify` - Validate token and generate config

### MCP Server
- `POST /mcp` - Main MCP endpoint for Claude Code

### Health Check
- `GET /health` - Server health status

## Available MCP Tools

### generate_test_plan
Generate a JMeter test plan from a description.

```javascript
{
  "method": "generate_test_plan",
  "params": {
    "prompt": "Test POST https://api.example.com/login with 100 users for 60 seconds",
    "jmxFilePath": "/path/to/existing.jmx" // optional
  }
}
```

### run_load_test
Execute a load test using a generated test plan.

```javascript
{
  "method": "run_load_test",
  "params": {
    "jmxFileName": "test-plan.jmx",
    "duration": 60,
    "numThreads": 100,
    "rampTime": 30
  }
}
```

### get_results
Get and analyze load test results.

```javascript
{
  "method": "get_results",
  "params": {
    "taskId": "task_12345",
    "thresholds": {
      "errorRatePct": 5,
      "p95Ms": 1000,
      "minThroughputRps": 50
    }
  }
}
```

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run clean` - Clean build directory

### Project Structure

```
kickload-mcp-remote/
├── public/
│   └── index.html            # Setup page
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Environment configuration
│   ├── types.ts              # TypeScript interfaces
│   ├── routes/
│   │   ├── mcp.ts            # MCP endpoint
│   │   └── verify.ts         # Token verification
│   └── kickload/
│       ├── client.ts         # HTTP client for KickLoad API
│       └── tools.ts          # MCP tool implementations
├── .env.example              # Environment template
├── Dockerfile                # Container configuration
└── package.json              # Dependencies and scripts
```

## Docker Deployment

### Build the image

```bash
docker build -t kickload-mcp-remote .
```

### Run the container

```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e KICKLOAD_BASE_URL=https://api.kickload.com \
  kickload-mcp-remote
```

### Railway Deployment

1. Connect your repository to Railway
2. Set environment variables:
   - `PORT=3000`
   - `KICKLOAD_BASE_URL=https://api.kickload.com`
3. Deploy!

### Other Platforms

This Docker image works on any platform that supports containers:
- Fly.io
- Heroku
- DigitalOcean App Platform
- AWS ECS
- Google Cloud Run

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `KICKLOAD_BASE_URL` | `https://api.kickload.com` | KickLoad API base URL |
| `KICKLOAD_API_TOKEN` | - | Optional default API token |

## Security Considerations

- API tokens are validated before generating configuration
- Tokens are only stored in Claude Desktop local configuration
- Server acts as a proxy and doesn't persist tokens
- Use HTTPS in production environments

## Troubleshooting

### Common Issues

1. **Token validation fails**
   - Verify your token from the KickLoad dashboard
   - Ensure token has proper permissions

2. **MCP connection issues**
   - Check that the server URL is accessible from Claude Desktop
   - Verify environment variables are set correctly

3. **Build errors**
   - Run `npm ci` to clean install dependencies
   - Ensure Node.js 18+ is installed

### Logs

The server logs important events:
- Server startup
- Token validation attempts
- MCP requests and responses
- Error conditions

Check the console output for debugging information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- Documentation: [KickLoad Docs](https://docs.kickload.com)
- Issues: Create an issue in this repository
- Support: support@kickload.com
