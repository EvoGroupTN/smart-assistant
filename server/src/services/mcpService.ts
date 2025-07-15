import { spawn, ChildProcess } from 'child_process';
import { WebSocket } from 'ws';
import { MCPServer, MCPTool, MCPResource, MCPToolCall } from '../types/index';
import { settingsService } from './settingsService';

export class MCPService {
  private servers: Map<string, MCPServer> = new Map();
  private connections: Map<string, ChildProcess | WebSocket> = new Map();

  constructor() {
    this.loadServerConfigurations();
  }

  async initialize(): Promise<void> {
    await this.autoStartEnabledServers();
  }

  private async loadServerConfigurations(): Promise<void> {
    try {
      const configPath = process.env.MCP_SERVERS_CONFIG_PATH || './mcp-servers.json';
      
      // Try to load from config file first
      try {
        const fs = await import('fs/promises');
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);
        this.loadServersFromConfig(config);
        console.log(`Loaded MCP configuration from: ${configPath}`);
      } catch (configError) {
        console.log(`Could not load MCP config from ${configPath}, using default servers`);
        this.initializeExampleServers();
      }
    } catch (error) {
      console.error('Failed to load MCP server configurations:', error);
      this.initializeExampleServers();
    }
  }

  private loadServersFromConfig(config: any): void {
    const servers: MCPServer[] = [];
    
    // Handle Claude Desktop format
    if (config.mcpServers) {
      for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
        const server = this.parseServerConfig(serverId, serverConfig as any);
        if (server) {
          servers.push(server);
        }
      }
    }
    
    // Handle direct array format
    if (Array.isArray(config)) {
      config.forEach((serverConfig, index) => {
        const server = this.parseServerConfig(serverConfig.id || `server-${index}`, serverConfig);
        if (server) {
          servers.push(server);
        }
      });
    }

    if (servers.length === 0) {
      console.log('No valid servers found in config, using default servers');
      this.initializeExampleServers();
    } else {
      servers.forEach(server => {
        this.servers.set(server.id, server);
      });
      console.log(`Loaded ${servers.length} MCP servers from configuration`);
    }
  }

  private parseServerConfig(id: string, config: any): MCPServer | null {
    try {
      const server: MCPServer = {
        id,
        name: config.name || id,
        url: config.url || `stdio://${id}`,
        transport: config.transport || 'stdio',
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        status: 'disconnected',
        tools: config.tools || [],
        resources: config.resources || [],
        disabled: config.disabled || false
      };

      // If tools aren't predefined, we'll discover them on connection
      if (!server.tools.length && server.command) {
        // Add placeholder tools that will be discovered on connection
        server.tools = [
          {
            name: `${id}_tool`,
            description: `Tool from ${server.name}`,
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ];
      }

      return server;
    } catch (error) {
      console.error(`Failed to parse server config for ${id}:`, error);
      return null;
    }
  }

  private initializeExampleServers(): void {
    const exampleServers: MCPServer[] = [
      {
        id: 'filesystem',
        name: 'File System Tools',
        url: 'stdio://filesystem',
        transport: 'stdio',
        command: undefined,
        args: undefined,
        status: 'disconnected',
        tools: [
          {
            name: 'read_file',
            description: 'Read the contents of a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to the file' }
              },
              required: ['path']
            }
          },
          {
            name: 'write_file',
            description: 'Write content to a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to the file' },
                content: { type: 'string', description: 'Content to write' }
              },
              required: ['path', 'content']
            }
          }
        ],
        resources: []
      },
      {
        id: 'web-search',
        name: 'Web Search Tools',
        url: 'stdio://web-search',
        transport: 'stdio',
        command: undefined,
        args: undefined,
        status: 'disconnected',
        tools: [
          {
            name: 'search_web',
            description: 'Search the web for information',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Maximum number of results' }
              },
              required: ['query']
            }
          }
        ],
        resources: []
      }
    ];

    exampleServers.forEach(server => {
      this.servers.set(server.id, server);
    });
  }

  async connectToServer(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      switch (server.transport) {
        case 'stdio':
          return await this.connectStdioServer(server);
        case 'websocket':
          return await this.connectWebSocketServer(server);
        case 'sse':
          return await this.connectSSEServer(server);
        default:
          throw new Error(`Unsupported transport: ${server.transport}`);
      }
    } catch (error) {
      console.error(`Failed to connect to server ${serverId}:`, error);
      server.status = 'error';
      return false;
    }
  }

  private async connectStdioServer(server: MCPServer): Promise<boolean> {
    return new Promise((resolve) => {
      if (!server.command) {
        // For demo servers without real command, simulate successful connection
        server.status = 'connected';
        console.log(`Demo MCP server connected: ${server.name}`);
        resolve(true);
        return;
      }

      console.log(`🚀 [MCP SPAWN] Starting MCP server "${server.name}" (${server.id})`);
      console.log(`   Command: ${server.command}`);
      console.log(`   Args:`, server.args || []);
      console.log(`   Config Environment Variables:`, Object.keys(server.env || {}).length > 0 ? server.env : 'None');
      console.log(`   Total Environment Variables: ${Object.keys({ ...process.env, ...server.env }).length}`);

      // Create a more complete environment for macOS compatibility
      const mergedEnv = { 
        ...process.env, 
        ...server.env,
        // Ensure proper PATH for finding shell and common commands
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        // Specify shell explicitly for macOS
        SHELL: process.env.SHELL || '/bin/zsh',
        // Set HOME directory
        HOME: process.env.HOME || require('os').homedir(),
        // Set user
        USER: process.env.USER || require('os').userInfo().username
      };
      const childProcess = spawn(server.command, server.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: mergedEnv
      });

      childProcess.on('spawn', () => {
        server.status = 'connected';
        this.connections.set(server.id, childProcess);
        console.log(`✅ [MCP SPAWN] Connected to MCP server: ${server.name}`);
        console.log(`   Process PID: ${childProcess.pid}`);
        
        // Send initial handshake and discover tools
        this.initializeServerConnection(server).then(() => {
          console.log(`Successfully initialized MCP server: ${server.name}`);
        }).catch((error) => {
          console.error(`Failed to initialize server ${server.name}:`, error);
        });
        
        resolve(true);
      });

      childProcess.on('error', (error) => {
        console.error(`❌ [MCP SPAWN ERROR] Error connecting to ${server.name}:`, error);
        server.status = 'error';
        resolve(false);
      });

      childProcess.on('exit', (code) => {
        console.log(`💀 [MCP EXIT] MCP server ${server.name} exited with code ${code}`);
        server.status = 'disconnected';
        this.connections.delete(server.id);
      });
    });
  }

  private async connectWebSocketServer(server: MCPServer): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(server.url);
        
        ws.on('open', () => {
          server.status = 'connected';
          this.connections.set(server.id, ws);
          console.log(`Connected to WebSocket MCP server: ${server.name}`);
          resolve(true);
        });

        ws.on('error', (error) => {
          console.error(`WebSocket error for ${server.name}:`, error);
          server.status = 'error';
          resolve(false);
        });

        ws.on('close', () => {
          console.log(`WebSocket connection closed for ${server.name}`);
          server.status = 'disconnected';
          this.connections.delete(server.id);
        });
      } catch (error) {
        console.error(`Failed to create WebSocket connection for ${server.name}:`, error);
        resolve(false);
      }
    });
  }

  private async connectSSEServer(server: MCPServer): Promise<boolean> {
    // SSE implementation would go here
    console.log(`SSE transport not yet implemented for ${server.name}`);
    return false;
  }

  async executeTool(serverId: string, toolCall: MCPToolCall): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const tool = server.tools.find(t => t.name === toolCall.name);
    if (!tool) {
      throw new Error(`Tool ${toolCall.name} not found on server ${serverId}`);
    }

    console.log(`🔧 [MCP REQUEST] Executing tool on server "${server.name}" (${serverId})`);
    console.log(`   Tool: ${toolCall.name}`);
    console.log(`   Arguments:`, JSON.stringify(toolCall.arguments, null, 2));
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    try {
      const message = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      };

      const startTime = Date.now();
      const response = await this.sendMessage(serverId, message);
      const duration = Date.now() - startTime;

      console.log(`✅ [MCP RESPONSE] Tool execution completed in ${duration}ms`);
      console.log(`   Server: ${server.name} (${serverId})`);
      console.log(`   Tool: ${toolCall.name}`);
      console.log(`   Response:`, JSON.stringify(response.result, null, 2));

      return response.result;
    } catch (error) {
      console.error(`❌ [MCP ERROR] Tool execution failed for ${toolCall.name} on ${server.name}:`, error);
      throw error;
    }
  }

  private async sendMessage(serverId: string, message: any): Promise<any> {
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (!connection) {
      throw new Error(`No connection found for server ${serverId}`);
    }

    const serverName = server?.name || serverId;
    const transport = connection instanceof ChildProcess ? 'stdio' : 'websocket';
    
    console.log(`📤 [MCP MESSAGE] Sending ${message.method || 'request'} to server "${serverName}" (${serverId})`);
    console.log(`   Transport: ${transport}`);
    console.log(`   Message ID: ${message.id || 'N/A'}`);
    console.log(`   Method: ${message.method || 'unknown'}`);
    console.log(`   Params:`, JSON.stringify(message.params || {}, null, 2));
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message) + '\n';
      const startTime = Date.now();

      console.log(`🔄 [MCP TRANSPORT] Sending raw message via ${transport}:`, messageStr.trim());

      if (connection instanceof ChildProcess) {
        if (connection.stdin) {
          connection.stdin.write(messageStr);
          
          // Buffer for accumulating partial responses
          let responseBuffer = '';
          
          // Listen for response with proper buffering
          const responseHandler = (data: Buffer) => {
            const rawData = data.toString();
            responseBuffer += rawData;
            
            console.log(`📥 [MCP RAW CHUNK] Received chunk from "${serverName}" (${rawData.length} chars)`);
            console.log(`   Buffer size: ${responseBuffer.length} chars`);
            
            // Try to extract complete JSON messages from buffer
            let processedLength = 0;
            const lines = responseBuffer.split('\n');
            
            // Process all complete lines (all except potentially the last one)
            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i].trim();
              processedLength += lines[i].length + 1; // +1 for newline
              
              if (line.length === 0) continue;
              
              try {
                const response = JSON.parse(line);
                console.log(`📥 [MCP PARSED RESPONSE] Successfully parsed response from "${serverName}"`);
                console.log(`   Message ID: ${response.id}, Looking for: ${message.id}`);
                
                if (response.id === message.id) {
                  const duration = Date.now() - startTime;
                  console.log(`✅ [MCP MESSAGE RESPONSE] Received response in ${duration}ms`);
                  console.log(`   Server: ${serverName} (${serverId})`);
                  console.log(`   Message ID: ${response.id}`);
                  console.log(`   Has Error: ${!!response.error}`);
                  if (response.error) {
                    console.log(`   Error:`, JSON.stringify(response.error, null, 2));
                  }
                  
                  // Log response size for large responses
                  const responseSize = JSON.stringify(response.result || response).length;
                  console.log(`   Response size: ${responseSize} chars`);
                  if (responseSize > 1000) {
                    console.log(`   Large response detected, truncating log...`);
                    console.log(`   Result (first 500 chars):`, JSON.stringify(response.result || response).substring(0, 500) + '...');
                  } else {
                    console.log(`   Result:`, JSON.stringify(response.result || response, null, 2));
                  }
                  
                  connection.stdout?.off('data', responseHandler);
                  resolve(response);
                  return;
                }
              } catch (error) {
                console.log(`⚠️ [MCP PARSE WARNING] Failed to parse line from "${serverName}":`, error);
                console.log(`   Raw line (${line.length} chars):`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
                console.log(`   First 10 char codes:`, line.split('').slice(0, 10).map(c => c.charCodeAt(0)));
                // Continue to next line
              }
            }
            
            // Remove processed content from buffer, keep the last potentially incomplete line
            if (processedLength > 0) {
              responseBuffer = responseBuffer.substring(processedLength);
              console.log(`🧹 [MCP BUFFER] Cleaned buffer, remaining: ${responseBuffer.length} chars`);
            }
          };

          connection.stdout?.on('data', responseHandler);
          
          // Increase timeout to 120 seconds for large responses
          const timeoutMs = 120000;
          setTimeout(() => {
            const duration = Date.now() - startTime;
            console.error(`⏰ [MCP TIMEOUT] Message to "${serverName}" timed out after ${duration}ms`);
            console.error(`   Message ID: ${message.id}`);
            console.error(`   Method: ${message.method}`);
            console.error(`   Buffer content at timeout: ${responseBuffer.substring(0, 200)}...`);
            
            connection.stdout?.off('data', responseHandler);
            reject(new Error(`MCP request timeout after ${timeoutMs/1000}s for server ${serverName}`));
          }, timeoutMs);
        } else {
          console.error(`❌ [MCP ERROR] stdin not available for server "${serverName}"`);
          reject(new Error('stdin not available'));
        }
      } else if (connection instanceof WebSocket) {
        connection.send(messageStr);
        
        // Buffer for WebSocket responses (they should come complete, but just in case)
        let wsResponseBuffer = '';
        
        const responseHandler = (data: string) => {
          wsResponseBuffer += data;
          console.log(`📥 [MCP RAW RESPONSE] Received from "${serverName}" via WebSocket (${data.length} chars)`);
          
          try {
            const response = JSON.parse(wsResponseBuffer);
            if (response.id === message.id) {
              const duration = Date.now() - startTime;
              console.log(`✅ [MCP MESSAGE RESPONSE] Received WebSocket response in ${duration}ms`);
              console.log(`   Server: ${serverName} (${serverId})`);
              console.log(`   Message ID: ${response.id}`);
              console.log(`   Has Error: ${!!response.error}`);
              if (response.error) {
                console.log(`   Error:`, JSON.stringify(response.error, null, 2));
              }
              
              // Log response size for large responses
              const responseSize = JSON.stringify(response.result || response).length;
              console.log(`   Response size: ${responseSize} chars`);
              if (responseSize > 1000) {
                console.log(`   Large response detected, truncating log...`);
                console.log(`   Result (first 500 chars):`, JSON.stringify(response.result || response).substring(0, 500) + '...');
              } else {
                console.log(`   Result:`, JSON.stringify(response.result || response, null, 2));
              }
              
              connection.off('message', responseHandler);
              resolve(response);
            }
          } catch (error) {
            console.log(`⚠️ [MCP PARSE WARNING] Failed to parse WebSocket response from "${serverName}":`, error);
            console.log(`   Buffer size: ${wsResponseBuffer.length} chars`);
            // For WebSocket, we might receive partial data, so we continue buffering
          }
        };

        connection.on('message', responseHandler);
        
        // Increase timeout to 120 seconds for large responses
        const timeoutMs = 120000;
        setTimeout(() => {
          const duration = Date.now() - startTime;
          console.error(`⏰ [MCP TIMEOUT] WebSocket message to "${serverName}" timed out after ${duration}ms`);
          console.error(`   Message ID: ${message.id}`);
          console.error(`   Method: ${message.method}`);
          
          connection.off('message', responseHandler);
          reject(new Error(`MCP WebSocket request timeout after ${timeoutMs/1000}s for server ${serverName}`));
        }, timeoutMs);
      }
    });
  }

  getAvailableServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getAvailableTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    console.log('Getting available tools from servers:', Array.from(this.servers.values()).map(s => ({ id: s.id, name: s.name, status: s.status, toolsCount: s.tools.length })));
    
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        console.log(`Adding tools from connected server ${server.id}:`, server.tools.map(t => t.name));
        tools.push(...server.tools);
      }
    }
    
    console.log('Total available tools:', tools.map(t => t.name));
    return tools;
  }

  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);

    if (connection) {
      if (connection instanceof ChildProcess) {
        connection.kill();
      } else if (connection instanceof WebSocket) {
        connection.close();
      }
      this.connections.delete(serverId);
    }

    if (server) {
      server.status = 'disconnected';
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.servers.keys()).map(serverId =>
      this.disconnectServer(serverId)
    );
    await Promise.all(disconnectPromises);
  }

  private async autoStartEnabledServers(): Promise<void> {
    console.log('🚀 [AUTO-START] Starting auto-start process for enabled MCP servers...');
    console.log(`🔍 [AUTO-START] Total servers loaded: ${this.servers.size}`);
    
    const serversToStart: string[] = [];
    
    // Log all loaded servers for debugging
    for (const [serverId, server] of this.servers) {
      console.log(`📋 [AUTO-START] Checking server: ${serverId} (${server.name})`);
      console.log(`   - Disabled: ${server.disabled}`);
      console.log(`   - Status: ${server.status}`);
      
      try {
        // Check if server should be auto-started
        const shouldStart = await this.shouldAutoStart(server);
        console.log(`   - Should auto-start: ${shouldStart}`);
        
        if (shouldStart) {
          serversToStart.push(serverId);
        }
      } catch (error) {
        console.error(`❌ [AUTO-START] Error checking auto-start for ${serverId}:`, error);
      }
    }

    if (serversToStart.length === 0) {
      console.log('⏭️ [AUTO-START] No MCP servers configured for auto-start');
      return;
    }

    console.log(`🎯 [AUTO-START] Auto-starting ${serversToStart.length} MCP servers: ${serversToStart.join(', ')}`);

    // Start servers concurrently but with some delay between them
    for (let i = 0; i < serversToStart.length; i++) {
      const serverId = serversToStart[i];
      
      try {
        console.log(`🔄 [AUTO-START] Starting MCP server: ${serverId}`);
        const success = await this.connectToServer(serverId);
        
        if (success) {
          console.log(`✅ [AUTO-START] Successfully started MCP server: ${serverId}`);
        } else {
          console.log(`❌ [AUTO-START] Failed to start MCP server: ${serverId}`);
        }
      } catch (error) {
        console.error(`❌ [AUTO-START] Error starting MCP server ${serverId}:`, error);
      }

      // Add a small delay between server starts to avoid overwhelming the system
      if (i < serversToStart.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('🏁 [AUTO-START] MCP server auto-start process completed');
  }

  private async shouldAutoStart(server: MCPServer): Promise<boolean> {
    // Don't auto-start if explicitly disabled
    if (server.disabled === true) {
      console.log(`Skipping auto-start for disabled server: ${server.name}`);
      return false;
    }

    try {
      // Load settings to check if server is activated
      const settings = await settingsService.loadSettings();
      
      // Check both server ID and name for backwards compatibility
      const isActivatedById = settings.activatedMCPServers.includes(server.id);
      const isActivatedByName = settings.activatedMCPServers.includes(server.name);
      const isActivated = isActivatedById || isActivatedByName;
      
      console.log(`Auto-start check for server "${server.name}" (ID: "${server.id}"):`);
      console.log(`  - Activated servers list:`, settings.activatedMCPServers);
      console.log(`  - Match by ID: ${isActivatedById}`);
      console.log(`  - Match by name: ${isActivatedByName}`);
      console.log(`  - Will auto-start: ${isActivated}`);
      
      if (isActivated) {
        console.log(`✅ Auto-starting activated server: ${server.name} (${server.id})`);
        
        // If activated by name, update settings to use ID for future consistency
        if (isActivatedByName && !isActivatedById) {
          console.log(`🔄 Updating settings to use server ID instead of name for: ${server.name}`);
          const updatedServers = settings.activatedMCPServers
            .filter(s => s !== server.name) // Remove name
            .concat(server.id); // Add ID
          await settingsService.updateSettings({ activatedMCPServers: updatedServers });
        }
        
        return true;
      } else {
        console.log(`⏭️ Skipping auto-start for non-activated server: ${server.name} (${server.id})`);
        return false;
      }
    } catch (error) {
      console.error(`Error loading settings for auto-start check:`, error);
      // Default to not auto-starting if we can't load settings
      return false;
    }
  }

  private async initializeServerConnection(server: MCPServer): Promise<void> {
    try {
      // Step 1: Send initialize request
      console.log(`Initializing MCP server: ${server.name}`);
      const initResponse = await this.sendMessage(server.id, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}
          },
          clientInfo: {
            name: 'webchat-ui',
            version: '1.0.0'
          }
        }
      });

      console.log(`Initialize response from ${server.name}:`, initResponse);

      // Step 2: Send initialized notification (no response expected)
      this.sendNotification(server.id, {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });

      // Step 3: Discover available tools
      console.log(`Discovering tools for server: ${server.name}`);
      const toolsResponse = await this.sendMessage(server.id, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      });

      console.log(`Tools discovered from ${server.name}:`, toolsResponse);

      // Step 4: Update server with discovered tools
      if (toolsResponse.result && toolsResponse.result.tools) {
        server.tools = toolsResponse.result.tools.map((tool: any) => {
          const parsedTool = {
            name: tool.name,
            description: tool.description || `Tool ${tool.name} from ${server.name}`,
            inputSchema: tool.inputSchema || {
              type: 'object',
              properties: {},
              required: []
            }
          };

          // Log the complete tool definition for debugging
          console.log(`Tool discovered from ${server.name}:`, {
            name: parsedTool.name,
            description: parsedTool.description,
            inputSchema: parsedTool.inputSchema
          });

          return parsedTool;
        });

        console.log(`Updated ${server.name} with ${server.tools.length} discovered tools:`, server.tools.map(t => t.name));
        console.log(`Complete tool definitions:`, server.tools);
      } else {
        console.log(`No tools discovered from ${server.name}, keeping existing tools`);
      }

      // Step 5: Discover available resources (optional)
      try {
        const resourcesResponse = await this.sendMessage(server.id, {
          jsonrpc: '2.0',
          id: 3,
          method: 'resources/list'
        });

        if (resourcesResponse.result && resourcesResponse.result.resources) {
          server.resources = resourcesResponse.result.resources;
          console.log(`Discovered ${server.resources.length} resources from ${server.name}`);
        }
      } catch (error) {
        console.log(`Server ${server.name} does not support resources discovery:`, error);
      }

    } catch (error: any) {
      console.error(`Failed to initialize server ${server.name}:`, error);
      throw error;
    }
  }

  private sendNotification(serverId: string, message: any): void {
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (!connection) {
      console.error(`❌ [MCP NOTIFICATION ERROR] No connection found for server ${serverId}`);
      return;
    }

    const serverName = server?.name || serverId;
    const transport = connection instanceof ChildProcess ? 'stdio' : 'websocket';
    const messageStr = JSON.stringify(message) + '\n';
    
    console.log(`📢 [MCP NOTIFICATION] Sending notification to server "${serverName}" (${serverId})`);
    console.log(`   Transport: ${transport}`);
    console.log(`   Method: ${message.method || 'unknown'}`);
    console.log(`   Notification:`, JSON.stringify(message, null, 2));
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`🔄 [MCP TRANSPORT] Sending notification via ${transport}:`, messageStr.trim());

    if (connection instanceof ChildProcess) {
      if (connection.stdin) {
        connection.stdin.write(messageStr);
        console.log(`✅ [MCP NOTIFICATION] Notification sent via stdio to "${serverName}"`);
      } else {
        console.error(`❌ [MCP NOTIFICATION ERROR] stdin not available for server "${serverName}"`);
      }
    } else if (connection instanceof WebSocket) {
      connection.send(messageStr);
      console.log(`✅ [MCP NOTIFICATION] Notification sent via WebSocket to "${serverName}"`);
    }
  }

  private async loadConfigFromFile(configPath: string): Promise<any> {
    try {
      const fs = await import('fs/promises');
      const configData = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
  }

  async getConfig(): Promise<any> {
    try {
      const configPath = process.env.MCP_SERVERS_CONFIG_PATH || './mcp-servers.json';
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Get file stats
      const stats = await fs.stat(configPath);
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      return {
        config,
        configPath: path.resolve(configPath),
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        serverCount: config.mcpServers ? Object.keys(config.mcpServers).length : 0
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty config
        const configPath = process.env.MCP_SERVERS_CONFIG_PATH || './mcp-servers.json';
        const path = await import('path');
        
        return {
          config: { mcpServers: {} },
          configPath: path.resolve(configPath),
          fileSize: 0,
          lastModified: new Date().toISOString(),
          serverCount: 0
        };
      }
      throw new Error(`Failed to get config: ${error.message}`);
    }
  }

  async updateConfig(configContent: string): Promise<void> {
    try {
      const configPath = process.env.MCP_SERVERS_CONFIG_PATH || './mcp-servers.json';
      const fs = await import('fs/promises');
      
      // Validate JSON
      const config = JSON.parse(configContent);
      
      // Write the new configuration
      await fs.writeFile(configPath, configContent, 'utf-8');
      
      // Reload the configuration
      this.loadServersFromConfig(config);
      
      console.log(`MCP configuration updated and reloaded from: ${configPath}`);
    } catch (error: any) {
      throw new Error(`Failed to update config: ${error.message}`);
    }
  }
}
