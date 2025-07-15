import axios, { AxiosInstance } from 'axios';
import { CopilotRequest, MCPServer, MCPTool, ApiResponse } from '../types';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error);
        return Promise.reject(error);
      }
    );
  }

  // Chat endpoints
  async sendMessage(request: CopilotRequest): Promise<ApiResponse> {
    const response = await this.client.post('/chat/message', request);
    return response.data;
  }


  async executeTool(serverId: string, toolCall: any): Promise<ApiResponse> {
    const response = await this.client.post('/chat/tool/execute', {
      serverId,
      toolCall,
    });
    return response.data;
  }

  async getChatHistory(): Promise<ApiResponse<{ conversations: any[]; total: number }>> {
    const response = await this.client.get('/chat/history');
    return response.data;
  }

  async clearChat(): Promise<ApiResponse> {
    const response = await this.client.delete('/chat/clear');
    return response.data;
  }

  async continueWithToolCalls(conversationState: any, pendingToolCalls: any, mcpTools?: string[]): Promise<ApiResponse> {
    const response = await this.client.post('/chat/continue', {
      conversation_state: conversationState,
      pending_tool_calls: pendingToolCalls,
      mcpTools
    });
    return response.data;
  }

  // MCP endpoints
  async getMCPServers(): Promise<ApiResponse<{ servers: MCPServer[]; total: number }>> {
    const response = await this.client.get('/mcp/servers');
    return response.data;
  }

  async getMCPTools(): Promise<ApiResponse<{ tools: MCPTool[]; total: number }>> {
    const response = await this.client.get('/mcp/tools');
    return response.data;
  }

  async connectToMCPServer(serverId: string): Promise<ApiResponse> {
    const response = await this.client.post(`/mcp/servers/${serverId}/connect`);
    return response.data;
  }

  async disconnectFromMCPServer(serverId: string): Promise<ApiResponse> {
    const response = await this.client.post(`/mcp/servers/${serverId}/disconnect`);
    return response.data;
  }

  async executeMCPTool(serverId: string, toolName: string, args: any): Promise<ApiResponse> {
    const response = await this.client.post(`/mcp/servers/${serverId}/tools/${toolName}/execute`, {
      arguments: args,
    });
    return response.data;
  }

  async getMCPServerStatus(serverId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/mcp/servers/${serverId}/status`);
    return response.data;
  }

  async getMCPConfig(): Promise<ApiResponse> {
    const response = await this.client.get('/mcp/config');
    return response.data;
  }

  async updateMCPConfig(config: string): Promise<ApiResponse> {
    const response = await this.client.put('/mcp/config', { config });
    return response.data;
  }

  // Authentication endpoints
  async requestDeviceCode(): Promise<ApiResponse> {
    const response = await this.client.post('/auth/device/code');
    return response.data;
  }

  async pollForToken(sessionId: string): Promise<ApiResponse> {
    const response = await this.client.post('/auth/device/token', { sessionId });
    return response.data;
  }

  async validateAuth(): Promise<ApiResponse> {
    const response = await this.client.get('/auth/validate');
    return response.data;
  }

  async logout(): Promise<ApiResponse> {
    const response = await this.client.post('/auth/logout');
    return response.data;
  }

  // Settings endpoints
  async getSettings(): Promise<ApiResponse> {
    const response = await this.client.get('/settings');
    return response.data;
  }

  async saveSettings(settings: any): Promise<ApiResponse> {
    const response = await this.client.put('/settings', settings);
    return response.data;
  }

  async updateSettings(partialSettings: any): Promise<ApiResponse> {
    const response = await this.client.patch('/settings', partialSettings);
    return response.data;
  }

  async resetSettings(): Promise<ApiResponse> {
    const response = await this.client.delete('/settings');
    return response.data;
  }

  async getSettingsInfo(): Promise<ApiResponse> {
    const response = await this.client.get('/settings/info');
    return response.data;
  }

  async setAIService(service: string): Promise<ApiResponse> {
    const response = await this.client.post('/settings/ai-service', { service });
    return response.data;
  }

  // Health check
  async checkHealth(): Promise<ApiResponse> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;
