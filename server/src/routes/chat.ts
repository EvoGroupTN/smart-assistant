import { Router, Request, Response } from 'express';
import { z } from 'zod';
//import { CopilotService } from '../services/copilotService';
import { OpenRouterService } from '../services/openRouterService';
import { MCPService } from '../services/mcpService';
import { ChatMessage, AIRequest } from '../types/index';
import { AIService } from '../services/aiService';

const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  timestamp: z.string().transform(str => new Date(str)),
  mcpTools: z.array(z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.any()),
    result: z.any().optional(),
    error: z.string().optional()
  })).optional(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional()
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(4096).optional(),
  mcpTools: z.array(z.string()).optional(),
  autoExecuteTools: z.array(z.string()).optional(),
  requireConfirmationForAll: z.boolean().optional()
});

// Helper function to execute tool calls
async function executeToolCall(toolCall: any, mcpService: MCPService): Promise<any> {
  // Find which server has this tool
  const availableServers = mcpService.getAvailableServers();
  
  for (const server of availableServers) {
    if (server.status === 'connected') {
      const tool = server.tools.find(t => t.name === toolCall.function.name);
      if (tool) {
        let parsedArguments;
        
        try {
          // Parse arguments with error handling for malformed JSON
          if (typeof toolCall.function.arguments === 'string') {
            // Try to fix common JSON issues
            let argsString = toolCall.function.arguments;
            
            // Fix incomplete objects like {"command": "ls -la", "workingDir"}
            // by removing incomplete trailing properties
            if (argsString.includes('"workingDir"}')) {
              argsString = argsString.replace(/,\s*"workingDir"}\s*$/, '}');
            }
            
            // Try to parse the fixed string
            parsedArguments = JSON.parse(argsString);
          } else {
            parsedArguments = toolCall.function.arguments;
          }
        } catch (error: any) {
          console.error('Failed to parse tool call arguments:', {
            original: toolCall.function.arguments,
            error: error.message
          });
          
          // Fallback: try to extract what we can from the malformed JSON
          if (typeof toolCall.function.arguments === 'string') {
            try {
              // Extract command if it exists
              const commandMatch = toolCall.function.arguments.match(/"command":\s*"([^"]+)"/);
              if (commandMatch) {
                parsedArguments = { command: commandMatch[1] };
                console.log('Extracted arguments from malformed JSON:', parsedArguments);
              } else {
                throw new Error(`Cannot parse tool arguments: ${toolCall.function.arguments}`);
              }
            } catch (fallbackError) {
              throw new Error(`Invalid tool arguments format: ${toolCall.function.arguments}`);
            }
          } else {
            throw new Error('Tool arguments are not in string format and cannot be parsed');
          }
        }
        
        const mcpToolCall = {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: parsedArguments
        };
        
        return await mcpService.executeTool(server.id, mcpToolCall);
      }
    }
  }
  
  throw new Error(`Tool ${toolCall.function.name} not found on any connected server`);
}

export default function createChatRoutes(aiService: AIService, mcpService: MCPService) {
  const router = Router();

  // Send chat message
  router.post('/message', async (req: Request, res: Response) => {
    try {
      const validatedData = chatRequestSchema.parse(req.body);
      
      const copilotRequest: AIRequest = {
        messages: validatedData.messages,
        stream: validatedData.stream || false,
        temperature: validatedData.temperature,
        maxTokens: validatedData.maxTokens,
        mcpTools: validatedData.mcpTools
      };

      // Use non-streaming mode only
        let currentMessages = copilotRequest.messages;
        let finalResponse = await aiService.createChatCompletion({
          ...copilotRequest,
          messages: currentMessages
        }, mcpService);
        
        // Check if there are tool calls to execute
        if (finalResponse.choices?.[0]?.message?.tool_calls) {
          const toolCalls = finalResponse.choices[0].message.tool_calls;
          const autoExecuteTools = validatedData.autoExecuteTools || [];
          const requireConfirmationForAll = validatedData.requireConfirmationForAll ?? false;
          
          console.log(`Tool calls detected: ${toolCalls.length} tool calls`);
          console.log('Auto-execute tools:', autoExecuteTools);
          console.log('Require confirmation for all:', requireConfirmationForAll);
          
          // Determine which tools can be auto-executed
          const autoExecutableTools = requireConfirmationForAll ? [] : toolCalls.filter(toolCall => 
            autoExecuteTools.includes(toolCall.function?.name)
          );
          const confirmationRequiredTools = toolCalls.filter(toolCall => 
            requireConfirmationForAll || !autoExecuteTools.includes(toolCall.function?.name)
          );
          
          console.log(`Auto-executable: ${autoExecutableTools.length}, Confirmation required: ${confirmationRequiredTools.length}`);
          
          // Execute auto-executable tools immediately
          let autoExecutionResults: any[] = [];
          if (autoExecutableTools.length > 0) {
            console.log(`Auto-executing ${autoExecutableTools.length} safe tools...`);
            
            autoExecutionResults = await Promise.all(
              autoExecutableTools.map(async (toolCall: any) => {
                try {
                  const result = await executeToolCall(toolCall, mcpService);
                  return { ...toolCall, result };
                } catch (error: any) {
                  return { ...toolCall, error: error.message };
                }
              })
            );
            
            // Create tool result messages for auto-executed tools
            const autoToolResultMessages: ChatMessage[] = autoExecutionResults.map(toolResult => ({
              id: `tool-result-${toolResult.id}-${Date.now()}`,
              role: 'tool' as const,
              content: JSON.stringify(toolResult.result || { error: toolResult.error }),
              timestamp: new Date(),
              tool_call_id: toolResult.id
            }));

            // Create assistant message with auto-executed tool calls
            const autoAssistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}-auto`,
              role: 'assistant' as const,
              content: finalResponse.choices[0].message.content || '',
              timestamp: new Date(),
              tool_calls: autoExecutableTools
            };

            // Update conversation with auto-execution results
            currentMessages = [
              ...currentMessages,
              autoAssistantMessage,
              ...autoToolResultMessages
            ];
            
            // If there are still tools requiring confirmation, get a follow-up response
            if (confirmationRequiredTools.length > 0) {
              console.log('Getting follow-up response after auto-execution...');
              const followUpRequest: AIRequest = {
                ...copilotRequest,
                messages: currentMessages
              };

              const followUpResponse = await aiService.createChatCompletion(followUpRequest, mcpService);
              
              // Check if the follow-up response has more tool calls
              if (followUpResponse.choices?.[0]?.message?.tool_calls) {
                // Return confirmation required for new tool calls
                res.json({
                  success: true,
                  data: {
                    ...followUpResponse,
                    tool_results: autoExecutionResults,
                    requires_confirmation: true,
                    pending_tool_calls: followUpResponse.choices[0].message.tool_calls,
                    conversation_state: currentMessages,
                    message: 'Additional tool calls are required. Please confirm to proceed.'
                  },
                  timestamp: new Date().toISOString()
                });
              } else {
                // No more tool calls, return final response with auto-execution results
                res.json({
                  success: true,
                  data: {
                    ...followUpResponse,
                    tool_results: autoExecutionResults,
                    requires_confirmation: false
                  },
                  timestamp: new Date().toISOString()
                });
              }
            } else {
              // All tools were auto-executed, get final response
              console.log('All tools auto-executed, getting final response...');
              const finalRequest: AIRequest = {
                ...copilotRequest,
                messages: currentMessages
              };

              const finalFinalResponse = await aiService.createChatCompletion(finalRequest, mcpService);
              
              res.json({
                success: true,
                data: {
                  ...finalFinalResponse,
                  tool_results: autoExecutionResults,
                  requires_confirmation: false
                },
                timestamp: new Date().toISOString()
              });
            }
          } else {
            // No auto-executable tools, require confirmation for all
            res.json({
              success: true,
              data: {
                ...finalResponse,
                requires_confirmation: true,
                pending_tool_calls: confirmationRequiredTools,
                conversation_state: currentMessages,
                message: 'Tool calls are required to complete this request. Please confirm to proceed.'
              },
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // No tool calls, return original response
          res.json({
            success: true,
            data: {
              ...finalResponse,
              requires_confirmation: false
            },
            timestamp: new Date().toISOString()
          });
        }
    } catch (error: any) {
      console.error('Chat error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to process chat message',
        message: error.message
      });
    }
  });

  // Continue with pending tool calls after user confirmation
  router.post('/continue', async (req: Request, res: Response) => {
    try {
      const { conversation_state, pending_tool_calls, mcpTools } = req.body;

      if (!conversation_state || !pending_tool_calls) {
        return res.status(400).json({
          success: false,
          error: 'conversation_state and pending_tool_calls are required'
        });
      }

      console.log(`User confirmed: executing ${pending_tool_calls.length} additional tool calls`);
      
      // Execute the pending tool calls
      const toolResults = await Promise.all(
        pending_tool_calls.map(async (toolCall: any) => {
          try {
            const result = await executeToolCall(toolCall, mcpService);
            return { ...toolCall, result };
          } catch (error: any) {
            return { ...toolCall, error: error.message };
          }
        })
      );
      
      // Create tool result messages for the conversation
      const toolResultMessages: ChatMessage[] = toolResults.map(toolResult => ({
        id: `tool-result-${toolResult.id}-${Date.now()}`,
        role: 'tool' as const,
        content: JSON.stringify(toolResult.result || { error: toolResult.error }),
        timestamp: new Date(),
        tool_call_id: toolResult.id
      }));

      // Create assistant message with the pending tool calls
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}-continued`,
        role: 'assistant' as const,
        content: '', // This was the response that requested more tool calls
        timestamp: new Date(),
        tool_calls: pending_tool_calls
      };

      // Build updated conversation
      const updatedMessages = [
        ...conversation_state,
        assistantMessage,
        ...toolResultMessages
      ];

      // Make follow-up call to Copilot with the new tool results
      console.log('Making follow-up call to Copilot with additional tool results...');
      const followUpRequest: AIRequest = {
        messages: updatedMessages,
        stream: false,
        mcpTools: mcpTools
      };

      const followUpResponse = await aiService.createChatCompletion(followUpRequest, mcpService);
      
      // Check if Copilot wants to make even more tool calls
      if (followUpResponse.choices?.[0]?.message?.tool_calls) {
        console.log('Copilot requested yet more tool calls - requiring user confirmation again');
        
        // Return response indicating more tool calls are pending and require confirmation
        res.json({
          success: true,
          data: {
            ...followUpResponse,
            tool_results: toolResults,
            requires_confirmation: true,
            pending_tool_calls: followUpResponse.choices[0].message.tool_calls,
            conversation_state: updatedMessages,
            message: 'Additional tool calls are required. Please confirm to proceed.'
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // No more tool calls needed, return final response
        res.json({
          success: true,
          data: {
            ...followUpResponse,
            tool_results: toolResults,
            requires_confirmation: false
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error('Continue execution error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to continue tool execution',
        message: error.message
      });
    }
  });

  // Execute MCP tool
  router.post('/tool/execute', async (req: Request, res: Response) => {
    try {
      const { serverId, toolCall } = req.body;

      if (!serverId || !toolCall) {
        return res.status(400).json({
          success: false,
          error: 'serverId and toolCall are required'
        });
      }

      const result = await mcpService.executeTool(serverId, toolCall);

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
      console.error('Tool execution error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to execute tool',
        message: error.message
      });
    }
  });

  // Get conversation history (placeholder)
  router.get('/history', async (req: Request, res: Response) => {
    try {
      // In a real implementation, this would fetch from a database
      res.json({
        success: true,
        data: {
          conversations: [],
          total: 0
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('History retrieval error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve conversation history',
        message: error.message
      });
    }
  });

  // Clear conversation (placeholder)
  router.delete('/clear', async (req: Request, res: Response) => {
    try {
      // In a real implementation, this would clear conversation data
      res.json({
        success: true,
        message: 'Conversation cleared',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Clear conversation error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to clear conversation',
        message: error.message
      });
    }
  });

  return router;
}
