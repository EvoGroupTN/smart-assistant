
import { OpenRouterService } from './openRouterService';
import { CopilotRequest } from '../types';
import dotenv from 'dotenv';
dotenv.config();
describe('OpenRouterService', () => {
  let openRouterService: OpenRouterService;
  beforeAll(() => {
    openRouterService = new OpenRouterService();
  });
  it('should return a valid response from the OpenRouter API', async () => {
    const request: CopilotRequest = {
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'what is the capital of Nigeria?',
          timestamp: new Date(),
        },
      ],
    };
    const response = await openRouterService.createChatCompletion(request);
    expect(response).toHaveProperty('choices');
    expect(response.choices[0]).toHaveProperty('message');
  }, 30000);

  it('should handle tool calls correctly with real API call', async () => {
    const request: CopilotRequest = {
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Use the get_weather tool to find the weather in London, UK',
          timestamp: new Date(),
        },
      ],
      mcpTools: ['get_weather'],
    };

    const mcpService = {
      getAvailableTools: () => [
        {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          inputSchema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA',
              },
            },
            required: ['location'],
          },
        },
      ],
    };

    const response = await openRouterService.createChatCompletion(request, mcpService);
    expect(response).toHaveProperty('choices');
    expect(response.choices[0].message).toHaveProperty('tool_calls');
  }, 30000);
});
