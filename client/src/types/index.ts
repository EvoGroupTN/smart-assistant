export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  mcpTools?: MCPToolCall[];
}

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  status: 'connected' | 'disconnected' | 'error';
  tools: MCPTool[];
  resources: MCPResource[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface CopilotRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  mcpTools?: string[];
}

export interface CopilotResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: any[];
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface WSMessage {
  type: 'chat' | 'mcp_update' | 'tool_call' | 'error' | 'connection';
  data: any;
  timestamp: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface ChatSettings {
  selectedMCPTools: string[];
  autoExecuteTools: string[];
  requireConfirmationForAll: boolean;
  activatedMCPServers: string[];
}
