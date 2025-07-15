import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Drawer,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { ChatMessage, ChatSettings } from '../types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import MCPToolsPanel from './MCPToolsPanel';
import { v4 as uuidv4 } from 'uuid';

const DRAWER_WIDTH = 320;

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settings, setSettings] = useState<ChatSettings>({
    selectedMCPTools: [],
    autoExecuteTools: [], // No default auto-execute tools
    requireConfirmationForAll: false, // Allow auto-execution by default (when user configures tools)
    activatedMCPServers: [],
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    pendingToolCalls: any[];
    conversationState: any;
    message: string;
    assistantMessageId: string;
  }>({
    open: false,
    pendingToolCalls: [],
    conversationState: null,
    message: '',
    assistantMessageId: '',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatToolResults = (toolResults: any[]) => {
    return toolResults.map((result: any) => {
      if (result.result && result.result.content) {
        const resultContent = result.result.content[0];
        if (resultContent.type === 'text') {
          try {
            const parsed = JSON.parse(resultContent.text);
            
            let formattedResult = `\n\n🔧 **Tool Execution Result** (${result.function?.name || 'Unknown Tool'})\n`;
            
            // Handle terminal command results
            if (parsed.command || parsed.stdout !== undefined || parsed.stderr !== undefined) {
              // Command information
              if (parsed.command) {
                formattedResult += `\n**Command:** \`${parsed.command}\`\n`;
              }
              
              // Execution info
              const execInfo = [];
              if (parsed.exitCode !== undefined) execInfo.push(`Exit Code: ${parsed.exitCode}`);
              if (parsed.executionTime !== undefined) execInfo.push(`Time: ${parsed.executionTime}ms`);
              if (parsed.success !== undefined) execInfo.push(`Success: ${parsed.success}`);
              
              if (execInfo.length > 0) {
                formattedResult += `**Status:** ${execInfo.join(' | ')}\n`;
              }
              
              // STDOUT - terminal style
              if (parsed.stdout !== undefined) {
                if (parsed.stdout.trim()) {
                  formattedResult += `\n**📤 Standard Output:**\n\`\`\`bash\n${parsed.stdout}\n\`\`\`\n`;
                } else {
                  formattedResult += `\n**📤 Standard Output:** _(empty)_\n`;
                }
              }
              
              // STDERR - terminal style with different color indication
              if (parsed.stderr !== undefined) {
                if (parsed.stderr.trim()) {
                  formattedResult += `\n**🚨 Standard Error:**\n\`\`\`bash\n${parsed.stderr}\n\`\`\`\n`;
                } else {
                  formattedResult += `\n**🚨 Standard Error:** _(none)_\n`;
                }
              }
              
              // Timestamp
              if (parsed.timestamp) {
                formattedResult += `\n_Executed at: ${new Date(parsed.timestamp).toLocaleString()}_`;
              }
            } else {
              // Handle API responses or other structured data
              formattedResult += `\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
            }
            
            return formattedResult;
          } catch (e) {
            return `\n\n🔧 **Tool Execution Result:**\n\`\`\`\n${resultContent.text}\n\`\`\``;
          }
        }
      } else if (result.error) {
        return `\n\n🔧 **Tool Execution Error** (${result.function?.name || 'Unknown Tool'})\n\n❌ ${result.error}`;
      }
      return `\n\n🔧 **Tool Execution Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
    }).join('\n');
  };

  const handleConfirmToolCalls = async () => {
    setConfirmationDialog(prev => ({ ...prev, open: false }));
    setIsLoading(true);

    try {
      const { apiService } = await import('../services/api');
      
      const response = await apiService.continueWithToolCalls(
        confirmationDialog.conversationState,
        confirmationDialog.pendingToolCalls,
        settings.selectedMCPTools
      );

      if (response.success && response.data) {
        // Check if more confirmation is needed
        if ((response.data as any).requires_confirmation) {
          // Update the current message with new tool results
          let toolResultsText = '';
          if ((response.data as any).tool_results && (response.data as any).tool_results.length > 0) {
            toolResultsText = formatToolResults((response.data as any).tool_results);
          }

          setMessages(prev =>
            prev.map(msg =>
              msg.id === confirmationDialog.assistantMessageId
                ? { ...msg, content: msg.content + toolResultsText }
                : msg
            )
          );

          // Show another confirmation dialog
          setConfirmationDialog({
            open: true,
            pendingToolCalls: (response.data as any).pending_tool_calls,
            conversationState: (response.data as any).conversation_state,
            message: (response.data as any).message || 'Additional tool calls are required. Please confirm to proceed.',
            assistantMessageId: confirmationDialog.assistantMessageId,
          });
        } else {
          // Final response - update message with final content
          const choice = response.data.choices[0];
          const message = choice?.message;
          let content = message?.content || '';
          
          let toolResultsText = '';
          if ((response.data as any).tool_results && (response.data as any).tool_results.length > 0) {
            toolResultsText = formatToolResults((response.data as any).tool_results);
          }

          setMessages(prev =>
            prev.map(msg =>
              msg.id === confirmationDialog.assistantMessageId
                ? { ...msg, content: msg.content + toolResultsText + '\n\n' + content }
                : msg
            )
          );
        }
      } else {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === confirmationDialog.assistantMessageId
              ? { ...msg, content: msg.content + `\n\n❌ Error continuing tool execution: ${response.error || 'Unknown error'}` }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Continue tool calls error:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === confirmationDialog.assistantMessageId
            ? { ...msg, content: msg.content + `\n\n❌ Error continuing tool execution: ${error}` }
            : msg
        )
      );
    }

    setIsLoading(false);
  };

  const handleDeclineToolCalls = () => {
    setConfirmationDialog(prev => ({ ...prev, open: false }));
    
    // Add a message indicating the user declined
    setMessages(prev =>
      prev.map(msg =>
        msg.id === confirmationDialog.assistantMessageId
          ? { ...msg, content: msg.content + '\n\n⚠️ Additional tool execution was declined by user.' }
          : msg
      )
    );
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load settings from server on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { apiService } = await import('../services/api');
        const response = await apiService.getSettings();
        
        if (response.success && response.data) {
          console.log('Settings loaded from server:', response.data.settings);
          setSettings(response.data.settings);
        } else {
          console.log('Failed to load settings, using defaults:', response.error);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Initialize with welcome message
  useEffect(() => {
    const welcomeMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: `Welcome to WebChat UI! I'm powered by GitHub Copilot API with MCP tools support.

You can:
- Ask me questions and have natural conversations
- Use MCP tools to extend my capabilities
- Configure settings using the panel on the right

To get started, try asking me something or explore the available MCP tools in the side panel.`,
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  }, []);

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Create assistant message placeholder
      const assistantMessageId = uuidv4();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Import API service dynamically to avoid loading issues
      const { apiService } = await import('../services/api');

      const request = {
        messages: [...messages, userMessage],
        mcpTools: settings.selectedMCPTools,
        autoExecuteTools: settings.autoExecuteTools,
        requireConfirmationForAll: settings.requireConfirmationForAll,
      };

      // Use non-streaming mode only
        const response = await apiService.sendMessage(request);
        
        if (response.success && response.data) {
          // Check if confirmation is required for additional tool calls
          if ((response.data as any).requires_confirmation) {
            console.log('Confirmation required for additional tool calls');
            
            // Show current response first
            const choice = response.data.choices[0];
            const message = choice?.message;
            let content = message?.content || '';
            
            // Add tool results to the message
            let toolResultsText = '';
            if ((response.data as any).tool_results && (response.data as any).tool_results.length > 0) {
              toolResultsText = formatToolResults((response.data as any).tool_results);
            }
            
            const currentContent = content + toolResultsText;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: currentContent }
                  : msg
              )
            );
            
            // Show confirmation dialog
            setConfirmationDialog({
              open: true,
              pendingToolCalls: (response.data as any).pending_tool_calls,
              conversationState: (response.data as any).conversation_state,
              message: (response.data as any).message || 'Additional tool calls are required. Please confirm to proceed.',
              assistantMessageId,
            });
            setIsLoading(false);
          } else {
            // Regular response without confirmation needed
            const choice = response.data.choices[0];
            const message = choice?.message;
            let content = message?.content || '';
            
            // Handle tool results that come back from the server (non-streaming mode)
            let toolResultsText = '';
            if ((response.data as any).tool_results && (response.data as any).tool_results.length > 0) {
              toolResultsText = formatToolResults((response.data as any).tool_results);
            }
            
            // Update message with content and tool results
            const finalContent = content + toolResultsText || 'No response';
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: finalContent }
                  : msg
              )
            );
            setIsLoading(false);
          }
        } else {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: `Error: ${response.error || 'Unknown error'}` }
                : msg
            )
          );
          setIsLoading(false);
        }
    } catch (error) {
      console.error('Message send error:', error);
      setMessages(prev => prev.slice(0, -1)); // Remove assistant message placeholder
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleSettingsChange = async (newSettings: ChatSettings) => {
    // Update local state immediately for responsiveness
    setSettings(newSettings);
    
    // Save to server asynchronously
    if (settingsLoaded) {
      try {
        const { apiService } = await import('../services/api');
        const response = await apiService.saveSettings(newSettings);
        
        if (response.success) {
          console.log('Settings saved to server successfully');
        } else {
          console.error('Failed to save settings to server:', response.error);
        }
      } catch (error) {
        console.error('Error saving settings to server:', error);
      }
    }
  };

  const handleToggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex' }}>
      {/* App Bar */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            WebChat UI - GitHub Copilot with MCP Tools
          </Typography>
          <IconButton
            color="inherit"
            onClick={handleToggleDrawer}
            sx={{ ml: 1 }}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          transition: (theme) =>
            theme.transitions.create(['margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          marginRight: drawerOpen ? `${DRAWER_WIDTH}px` : 0,
        }}
      >
        <Toolbar /> {/* Spacer for app bar */}
        
        {/* Messages Area */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            p: 1,
          }}
        >
          <Container maxWidth="md" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper
              elevation={1}
              sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                mb: 2,
              }}
            >
              <MessageList
                messages={messages}
                isLoading={isLoading}
                onClearChat={handleClearChat}
              />
              <div ref={messagesEndRef} />
            </Paper>

            {/* Message Input */}
            <MessageInput
              onSendMessage={handleSendMessage}
              disabled={isLoading}
            />
          </Container>
        </Box>
      </Box>

      {/* Settings Drawer */}
      <Drawer
        variant="persistent"
        anchor="right"
        open={drawerOpen}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar /> {/* Spacer for app bar */}
        <MCPToolsPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setDrawerOpen(false)}
        />
      </Drawer>

      {/* Tool Confirmation Dialog */}
      <Dialog
        open={confirmationDialog.open}
        onClose={() => {}} // Prevent closing by clicking outside
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          🔧 Tool Execution Confirmation Required
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmationDialog.message}
          </DialogContentText>
          
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Pending Tool Calls:
          </Typography>
          
          <List dense>
            {confirmationDialog.pendingToolCalls.map((toolCall, index) => (
              <ListItem key={index} sx={{ bgcolor: 'grey.50', mb: 1, borderRadius: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  🔧 {toolCall.function?.name || 'Unknown Tool'}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>Arguments:</strong>
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'grey.100',
                    p: 1,
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    maxHeight: '100px',
                    width: '100%',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(
                    typeof toolCall.function?.arguments === 'string'
                      ? JSON.parse(toolCall.function.arguments)
                      : toolCall.function?.arguments,
                    null,
                    2
                  )}
                </Box>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleDeclineToolCalls} 
            color="error"
            variant="outlined"
          >
            Decline
          </Button>
          <Button 
            onClick={handleConfirmToolCalls} 
            color="primary" 
            variant="contained"
            disabled={isLoading}
          >
            {isLoading ? 'Executing...' : 'Confirm & Execute'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatInterface;
