import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'https';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';

import { CopilotService } from './services/copilotService';
import { MCPService } from './services/mcpService';
import chatRoutes from './routes/chat';
import mcpRoutes from './routes/mcp';
import authRoutes from './routes/auth';
import settingsRoutes from './routes/settings';
import { WSMessage } from './types/index';
import { OpenRouterService } from './services/openRouterService';
import { AIService } from './services/aiService';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const certPath = path.resolve(__dirname, '../certs/server.crt');
const keyPath = path.resolve(__dirname, '../certs/server.key');
const httpsOptions = {
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
};
// Create HTTPS server
const server = createServer(httpsOptions, app);

// Initialize services
const copilotService = new CopilotService();
const openRouterService = new OpenRouterService();
const mcpService = new MCPService();

let activeAIService: AIService = openRouterService;

export const setActiveAIService = (serviceName: 'copilot' | 'openrouter') => {
  if (serviceName === 'copilot') {
    activeAIService = copilotService;
  } else {
    activeAIService = openRouterService;
  }
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', (req, res, next) => chatRoutes(activeAIService, mcpService)(req, res, next));
app.use('/api/mcp', mcpRoutes(mcpService));
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      copilot: 'unknown', // Would check copilotService.validateConnection()
      mcp: mcpService.getAvailableServers().length
    }
  });
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, request) => {
  console.log('New WebSocket connection established');

  ws.on('message', async (data) => {
    try {
      const message: WSMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'chat':
          // Handle real-time chat messages
          break;
        case 'mcp_update':
          // Handle MCP tool updates
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: new Date()
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send initial connection message
  ws.send(JSON.stringify({
    type: 'connection',
    data: { status: 'connected' },
    timestamp: new Date()
  }));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Disconnect MCP services
  await mcpService.disconnectAll();
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Disconnect MCP services
  await mcpService.disconnectAll();
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Start server
server.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`WebSocket server ready`);
  
  // Initialize MCP service and auto-start enabled servers with a small delay
  // to ensure all services are fully ready
  setTimeout(async () => {
    try {
      console.log('🚀 [STARTUP] Initializing MCP service...');
      await mcpService.initialize();
      console.log('✅ [STARTUP] MCP service initialization completed');
    } catch (error) {
      console.error('❌ [STARTUP] Failed to initialize MCP service:', error);
    }
  }, 2000); // 2 second delay to ensure all services are ready
});

export { app, server, wss };
