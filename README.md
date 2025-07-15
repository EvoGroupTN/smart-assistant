# WebChat UI - GitHub Copilot with MCP Tools

A modern web chat interface that integrates with GitHub Copilot API and supports Model Context Protocol (MCP) tools for extended functionality.

## Features

- **GitHub Copilot Integration**: Direct integration with GitHub Copilot API for intelligent conversations
- **MCP Tools Support**: Connect and use MCP servers to extend the AI's capabilities
- **Real-time Streaming**: Support for streaming responses for better user experience
- **Modern UI**: Built with React and Material-UI for a clean, responsive interface
- **TypeScript**: Fully typed codebase for better development experience
- **Configurable**: Adjustable settings for temperature, max tokens, and tool selection

## Architecture

### Backend (Node.js + TypeScript)
- Express.js server with WebSocket support
- GitHub Copilot API integration
- MCP protocol implementation
- Rate limiting and security middleware

### Frontend (React + TypeScript)
- Modern React with hooks and functional components
- Material-UI for component library
- React Query for server state management
- WebSocket client for real-time features

## Prerequisites

- Node.js 18+ 
- GitHub token with Copilot API access
- npm or yarn package manager

## Installation

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd webchat-ui
   npm run install:all
   ```

2. **Configure environment variables**:
   ```bash
   # Copy example environment file
   cp server/.env.example server/.env
   
   # Edit server/.env and add your GitHub token:
   GITHUB_TOKEN=your_github_token_here
   ```

3. **Install dependencies for both client and server**:
   ```bash
   npm run install:all
   ```

## Development

Start both the client and server in development mode:

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend development server on http://localhost:3000

### Individual Services

Start only the backend:
```bash
npm run dev:server
```

Start only the frontend:
```bash
npm run dev:client
```

## Production Build

Build both client and server:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## Configuration

### GitHub Copilot API

1. Obtain a GitHub token with Copilot API access
2. Add it to `server/.env` as `GITHUB_TOKEN`

### MCP Servers

The application comes with example MCP server configurations in the `MCPService`. To add real MCP servers:

1. Configure MCP servers in the `initializeExampleServers()` method
2. Or create a `mcp-servers.json` configuration file
3. Update the server command paths and arguments as needed

### Environment Variables

All available environment variables are documented in `server/.env.example`:

- `GITHUB_TOKEN`: Your GitHub API token
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode
- `JWT_SECRET`: Secret for JWT tokens
- `ALLOWED_ORIGINS`: CORS allowed origins
- Rate limiting settings
- MCP configuration paths

## API Endpoints

### Chat Endpoints
- `POST /api/chat/message` - Send a chat message
- `POST /api/chat/tool/execute` - Execute an MCP tool
- `GET /api/chat/history` - Get conversation history
- `DELETE /api/chat/clear` - Clear conversation

### MCP Endpoints
- `GET /api/mcp/servers` - List all MCP servers
- `GET /api/mcp/tools` - List available tools
- `POST /api/mcp/servers/:id/connect` - Connect to MCP server
- `POST /api/mcp/servers/:id/disconnect` - Disconnect from MCP server
- `POST /api/mcp/servers/:id/tools/:tool/execute` - Execute tool

### Health Check
- `GET /api/health` - Server health status

## Usage

1. **Start the application** and navigate to http://localhost:3000
2. **Configure settings** using the settings panel (gear icon)
3. **Connect MCP servers** to enable additional tools
4. **Select tools** you want to make available to the AI
5. **Start chatting** with the AI assistant

### MCP Tools

The application supports various MCP tools:
- File system operations (read/write files)
- Web search capabilities
- Custom tools via MCP servers

Enable tools in the settings panel and they'll be available during conversations.

## Security

- Rate limiting on API endpoints
- CORS configuration
- Input validation and sanitization
- Environment-based configuration
- Secure headers with Helmet

## Troubleshooting

### Common Issues

1. **Dependencies not installing**: Make sure you have Node.js 18+ installed
2. **GitHub API errors**: Verify your GitHub token has Copilot API access
3. **MCP tools not working**: Check MCP server configurations and paths
4. **Port conflicts**: Change the PORT in `.env` if 3001 is already in use

### Logs

Check server logs for detailed error information:
```bash
npm run dev:server
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details
