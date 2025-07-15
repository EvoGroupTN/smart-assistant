import { AIRequest, AIResponse } from '../types/index';

export interface AIService {

  createChatCompletion(request: AIRequest, mcpService?: any): Promise<AIResponse>

  validateConnection(): Promise<boolean>
}
