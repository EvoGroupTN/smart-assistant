import axios, { AxiosInstance } from 'axios';
import { AIRequest, AIResponse } from '../types/index';
import { AIService } from './aiService';
import * as fs from 'fs/promises';
import * as path from 'path';

export class OpenRouterService implements AIService {
  private client: AxiosInstance;
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not configured');
    }

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/your-repo',
          'X-Title': 'Project AI WebChat',
        },
      timeout: 30000,
    });
  }

  async createChatCompletion(request: AIRequest, mcpService?: any): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const payload = {
        messages: request.messages,
        temperature: request.temperature || 0.7,
        stream: false,
        //model: 'deepseek/deepseek-r1-0528:free',
        model: 'google/gemini-2.5-flash',
        ...(request.mcpTools && request.mcpTools.length > 0 && {
          tools: this.formatMCPTools(request.mcpTools, mcpService)
        })
      };

      // Log the request
      await this.log('request', payload, {
        requestId,
        originalMessageCount: request.messages.length,
        mcpToolsCount: request.mcpTools?.length || 0,
        endpoint: '/chat/completions'
      });

      console.log('Sending payload to OpenRouter API with', payload.messages.length, 'messages');
      const response = await this.client.post('/chat/completions', payload);
      
      const duration = Date.now() - startTime;
      
      // Log the response
      await this.log('response', response.data, {
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
      await this.log('error', {
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
        console.error('OpenRouter API Response Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
        throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.error('OpenRouter API Request Error:', error.request);
        throw new Error('Failed to connect to OpenRouter API');
      } else {
        console.error('OpenRouter API Setup Error:', error.message);
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


  private async log(
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
          service: 'openRouter',
          version: '1.0.0'
        }
      };

      const logPath = path.join(process.cwd(), 'open-router-logs.json');
      
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
      console.error('Failed to log OpenRouter interaction:', error);
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
