import { Router, Request, Response } from 'express';
import { MCPService } from '../services/mcpService';

export default function createMCPRoutes(mcpService: MCPService) {
  const router = Router();

  // Get all available MCP servers
  router.get('/servers', async (req: Request, res: Response) => {
    try {
      const servers = mcpService.getAvailableServers();
      
      res.json({
        success: true,
        data: {
          servers,
          total: servers.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Get servers error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve MCP servers',
        message: error.message
      });
    }
  });

  // Get all available tools from connected servers
  router.get('/tools', async (req: Request, res: Response) => {
    try {
      const tools = mcpService.getAvailableTools();
      
      res.json({
        success: true,
        data: {
          tools,
          total: tools.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Get tools error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve MCP tools',
        message: error.message
      });
    }
  });

  // Connect to an MCP server
  router.post('/servers/:serverId/connect', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      console.log(`🌐 [API REQUEST] MCP server connection request received`);
      console.log(`   Client IP: ${clientIp}`);
      console.log(`   Server ID: ${serverId}`);
      console.log(`   Timestamp: ${new Date().toISOString()}`);

      const startTime = Date.now();
      const success = await mcpService.connectToServer(serverId);
      const duration = Date.now() - startTime;
      
      if (success) {
        console.log(`✅ [API RESPONSE] MCP server connection successful in ${duration}ms`);
        console.log(`   Server ID: ${serverId}`);
        
        res.json({
          success: true,
          message: `Successfully connected to server ${serverId}`,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`❌ [API RESPONSE] MCP server connection failed in ${duration}ms`);
        console.log(`   Server ID: ${serverId}`);
        
        res.status(400).json({
          success: false,
          error: `Failed to connect to server ${serverId}`
        });
      }
    } catch (error: any) {
      console.error(`❌ [API ERROR] MCP server connection error:`, error);
      console.error(`   Server ID: ${req.params.serverId}`);
      console.error(`   Error Message: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: 'Failed to connect to MCP server',
        message: error.message
      });
    }
  });

  // Disconnect from an MCP server
  router.post('/servers/:serverId/disconnect', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      console.log(`🌐 [API REQUEST] MCP server disconnection request received`);
      console.log(`   Client IP: ${clientIp}`);
      console.log(`   Server ID: ${serverId}`);
      console.log(`   Timestamp: ${new Date().toISOString()}`);

      const startTime = Date.now();
      await mcpService.disconnectServer(serverId);
      const duration = Date.now() - startTime;

      console.log(`✅ [API RESPONSE] MCP server disconnection completed in ${duration}ms`);
      console.log(`   Server ID: ${serverId}`);
      
      res.json({
        success: true,
        message: `Successfully disconnected from server ${serverId}`,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`❌ [API ERROR] MCP server disconnection error:`, error);
      console.error(`   Server ID: ${req.params.serverId}`);
      console.error(`   Error Message: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect from MCP server',
        message: error.message
      });
    }
  });

  // Execute a tool on a specific server
  router.post('/servers/:serverId/tools/:toolName/execute', async (req: Request, res: Response) => {
    try {
      const { serverId, toolName } = req.params;
      const { arguments: toolArgs } = req.body;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      console.log(`🌐 [API REQUEST] MCP tool execution request received`);
      console.log(`   Client IP: ${clientIp}`);
      console.log(`   Server ID: ${serverId}`);
      console.log(`   Tool Name: ${toolName}`);
      console.log(`   Arguments:`, JSON.stringify(toolArgs, null, 2));
      console.log(`   Timestamp: ${new Date().toISOString()}`);

      const toolCall = {
        id: `tool_${Date.now()}`,
        name: toolName,
        arguments: toolArgs || {}
      };

      const startTime = Date.now();
      const result = await mcpService.executeTool(serverId, toolCall);
      const duration = Date.now() - startTime;

      console.log(`✅ [API RESPONSE] MCP tool execution completed in ${duration}ms`);
      console.log(`   Server ID: ${serverId}`);
      console.log(`   Tool Name: ${toolName}`);
      console.log(`   Success: true`);

      res.json({
        success: true,
        data: {
          toolCall: {
            ...toolCall,
            result
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`❌ [API ERROR] MCP tool execution failed:`, error);
      console.error(`   Server ID: ${req.params.serverId}`);
      console.error(`   Tool Name: ${req.params.toolName}`);
      console.error(`   Error Message: ${error.message}`);
      
      res.status(500).json({
        success: false,
        error: 'Failed to execute tool',
        message: error.message
      });
    }
  });

  // Get server status
  router.get('/servers/:serverId/status', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const servers = mcpService.getAvailableServers();
      const server = servers.find(s => s.id === serverId);

      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found'
        });
      }

      res.json({
        success: true,
        data: {
          server: {
            id: server.id,
            name: server.name,
            status: server.status,
            toolsCount: server.tools.length,
            resourcesCount: server.resources.length
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Get server status error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get server status',
        message: error.message
      });
    }
  });

  // Get MCP configuration
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const configData = await mcpService.getConfig();
      
      res.json({
        success: true,
        data: configData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Get config error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to get MCP configuration',
        message: error.message
      });
    }
  });

  // Update MCP configuration
  router.put('/config', async (req: Request, res: Response) => {
    try {
      const { config } = req.body;
      
      if (!config) {
        return res.status(400).json({
          success: false,
          error: 'Configuration content is required'
        });
      }

      // Validate JSON
      try {
        JSON.parse(config);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON configuration',
          message: (parseError as Error).message
        });
      }

      await mcpService.updateConfig(config);
      
      res.json({
        success: true,
        message: 'Configuration updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Update config error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to update MCP configuration',
        message: error.message
      });
    }
  });

  // Manually trigger auto-start process
  router.post('/auto-start', async (req: Request, res: Response) => {
    try {
      console.log('🔄 [API REQUEST] Manual auto-start triggered');
      
      await mcpService.initialize();
      
      res.json({
        success: true,
        message: 'Auto-start process completed',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Auto-start error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to auto-start MCP servers',
        message: error.message
      });
    }
  });

  return router;
}
