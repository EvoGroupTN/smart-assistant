import axios, { AxiosInstance } from 'axios';
import { AIRequest, AIResponse } from '../types/index';
import { authService } from './authService';
import { AIService } from './aiService';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CopilotService implements AIService {
  private client: AxiosInstance;
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.COPILOT_API_URL || 'https://api.githubcopilot.com';

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'content-type': 'application/json',
        'editor-version': 'vscode/1.80.1',
        'user-agent': 'webchat-ui/1.0.0',
      },
      timeout: 30000,
    });

    // Add request interceptor to handle token refresh
    this.client.interceptors.request.use(async (config) => {
      try {
        const copilotToken = await authService.getValidCopilotToken();
        config.headers['authorization'] = `Bearer ${copilotToken}`;
        return config;
      } catch (error) {
        console.error('Failed to get Copilot token:', error);
        throw new Error(`Authentication failed: ${error}`);
      }
    });

    // Add response interceptor to handle token expiration
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            console.log('Copilot token expired, generating new one...');
            const githubToken = process.env.GITHUB_TOKEN;
            if (!githubToken) {
              throw new Error('No GitHub token available for refresh');
            }
            
            // Generate new Copilot token
            const newCopilotToken = await authService.generateCopilotToken(githubToken);
            originalRequest.headers['authorization'] = `Bearer ${newCopilotToken}`;
            
            return this.client(originalRequest);
          } catch (refreshError) {
            console.error('Failed to refresh Copilot token:', refreshError);
            return Promise.reject(refreshError);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  async createChatCompletion(request: AIRequest, mcpService?: any): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const payload = {
        messages: request.messages,
        temperature: request.temperature || 0.7,
        stream: false,
        model: 'gpt-4o',
        ...(request.mcpTools && request.mcpTools.length > 0 && {
          tools: this.formatMCPTools(request.mcpTools, mcpService)
        })
      };

      // Log the request
      await this.logCopilotInteraction('request', payload, {
        requestId,
        originalMessageCount: request.messages.length,
        mcpToolsCount: request.mcpTools?.length || 0,
        endpoint: '/chat/completions'
      });

      console.log('Sending payload to Copilot API with', payload.messages.length, 'messages');
      const response = await this.client.post('/chat/completions', payload);
      
      const duration = Date.now() - startTime;
      
      // Log the response
      await this.logCopilotInteraction('response', response.data, {
        requestId,
        duration,
        status: response.status,
        statusText: response.statusText,
        responseSize: JSON.stringify(response.data).length,
        hasToolCalls: !!response.data?.choices?.[0]?.message?.tool_calls?.length
      });
      
      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Log the error
      await this.logCopilotInteraction('error', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        stack: error.stack
      }, {
        requestId,
        duration,
        errorType: error.response ? 'http_error' : 'network_error'
      });
      
      if (error.response) {
        console.error('Copilot API Response Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
        throw new Error(`Copilot API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.error('Copilot API Request Error:', error.request);
        throw new Error('Failed to connect to Copilot API');
      } else {
        console.error('Copilot API Setup Error:', error.message);
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  }

  private formatMCPTools(toolNames: string[], mcpService?: any): any[] {
    console.log('Formatting MCP tools with:', { toolNames, hasMcpService: !!mcpService });
    
    if (!mcpService) {
      console.log('No MCP service provided, using fallback');
      // Fallback for when MCP service is not available
      return toolNames.map(toolName => ({
        type: 'function',
        function: {
          name: toolName,
          description: `MCP tool: ${toolName}`,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }));
    }

    const availableTools = mcpService.getAvailableTools();
    console.log('Available tools from MCP service:', availableTools.map((t: any) => ({ name: t.name, description: t.description })));
    
    const formattedTools = toolNames
      .map(toolName => {
        const tool = availableTools.find((t: any) => t.name === toolName);
        if (!tool) {
          console.log(`Tool ${toolName} not found in available tools`);
          return null;
        }

        const formatted = {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || {
              type: 'object',
              properties: {},
              required: []
            }
          }
        };
        
        console.log(`Formatted tool ${toolName}:`, formatted);
        return formatted;
      })
      .filter(Boolean);
      
    console.log('Final formatted tools:', formattedTools);
    return formattedTools;
  }


  private async logCopilotInteraction(
    type: 'request' | 'response' | 'error',
    data: any,
    metadata?: any
  ): Promise<void> {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type,
        data,
        metadata: {
          ...metadata,
          service: 'copilot',
          version: '1.0.0'
        }
      };

      const logPath = path.join(process.cwd(), 'copilot-logs.json');
      
      // Read existing logs or create empty array
      let existingLogs: any[] = [];
      try {
        const existingContent = await fs.readFile(logPath, 'utf-8');
        existingLogs = JSON.parse(existingContent);
      } catch (error) {
        // File doesn't exist or is invalid, start with empty array
        existingLogs = [];
      }

      // Add new log entry
      existingLogs.push(logEntry);

      // Keep only last 1000 entries to prevent file from growing too large
      if (existingLogs.length > 1000) {
        existingLogs = existingLogs.slice(-1000);
      }

      // Write back to file
      await fs.writeFile(logPath, JSON.stringify(existingLogs, null, 2));
    } catch (error) {
      console.error('Failed to log Copilot interaction:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}
