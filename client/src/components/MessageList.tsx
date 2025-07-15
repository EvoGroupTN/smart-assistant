import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Avatar,
  IconButton,
  Toolbar,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Person as PersonIcon,
  SmartToy as BotIcon,
  Clear as ClearIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ChatMessage } from '../types';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onClearChat: () => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  onClearChat,
}) => {
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});

  const formatTime = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Custom code component for ReactMarkdown with copy button
  const CodeBlock = ({ children, className, messageId, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    // Properly extract text content from children
    const extractTextContent = (node: any): string => {
      if (typeof node === 'string') {
        return node;
      }
      if (Array.isArray(node)) {
        return node.map(extractTextContent).join('');
      }
      if (node && typeof node === 'object' && node.props && node.props.children) {
        return extractTextContent(node.props.children);
      }
      if (node && typeof node === 'object') {
        return JSON.stringify(node, null, 2);
      }
      return String(node || '');
    };
    
    const codeText = extractTextContent(children).replace(/\n$/, '');
    const copyId = `code-${messageId}-${Math.random()}`;

    return (
      <Box sx={{ position: 'relative' }}>
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        >
          <Tooltip title={copiedStates[copyId] ? 'Copied!' : 'Copy code'}>
            <IconButton
              size="small"
              onClick={() => handleCopy(codeText, copyId)}
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                color: copiedStates[copyId] ? 'success.light' : 'rgba(255, 255, 255, 0.7)',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.2)',
                },
                p: 0.5,
              }}
            >
              {copiedStates[copyId] ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          component="pre"
          sx={{
            bgcolor: 'grey.900',
            color: 'white',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.875rem',
            maxHeight: '150px', // Limit to approximately 10 lines
            lineHeight: '15px',
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.5)',
              },
            },
          }}
          {...props}
        >
          <code className={className}>{children}</code>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Toolbar variant="dense" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Chat
        </Typography>
        <IconButton onClick={onClearChat} size="small">
          <ClearIcon />
        </IconButton>
      </Toolbar>

      {/* Messages */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary',
            }}
          >
            <BotIcon sx={{ fontSize: 48, mb: 2 }} />
            <Typography variant="h6">No messages yet</Typography>
            <Typography variant="body2">Start a conversation!</Typography>
          </Box>
        ) : (
          messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                display: 'flex',
                gap: 2,
                flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <Avatar
                sx={{
                  bgcolor: message.role === 'user' ? 'primary.main' : 'secondary.main',
                  width: 32,
                  height: 32,
                }}
              >
                {message.role === 'user' ? (
                  <PersonIcon fontSize="small" />
                ) : (
                  <BotIcon fontSize="small" />
                )}
              </Avatar>

              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  maxWidth: '70%',
                  bgcolor: message.role === 'user' ? 'primary.50' : 'grey.50',
                  borderRadius: 2,
                }}
              >
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {message.role === 'user' ? 'You' : 'Assistant'} •{' '}
                    {formatTime(message.timestamp)}
                  </Typography>
                </Box>

                {message.role === 'user' ? (
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {message.content}
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      '& pre': {
                        bgcolor: 'grey.900',
                        color: 'white',
                        p: 2,
                        borderRadius: 1,
                        overflow: 'auto',
                        fontSize: '0.875rem',
                        maxHeight: '150px', // Limit to approximately 10 lines
                        lineHeight: '15px',
                        scrollbarWidth: 'thin',
                        '&::-webkit-scrollbar': {
                          width: '8px',
                        },
                        '&::-webkit-scrollbar-track': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                        },
                        '&::-webkit-scrollbar-thumb': {
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          borderRadius: '4px',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.5)',
                          },
                        },
                      },
                      '& code:not(pre code)': {
                        bgcolor: 'grey.200',
                        px: 0.5,
                        py: 0.25,
                        borderRadius: 0.5,
                        fontSize: '0.875rem',
                      },
                      '& blockquote': {
                        borderLeft: 4,
                        borderColor: 'primary.main',
                        pl: 2,
                        ml: 0,
                        fontStyle: 'italic',
                      },
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        pre: ({ children, ...props }) => {
                          const codeElement = React.Children.toArray(children)[0] as React.ReactElement;
                          if (codeElement?.type === 'code') {
                            return (
                              <CodeBlock 
                                {...codeElement.props} 
                                messageId={message.id}
                              >
                                {codeElement.props.children}
                              </CodeBlock>
                            );
                          }
                          return <pre {...props}>{children}</pre>;
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </Box>
                )}

                {message.mcpTools && message.mcpTools.length > 0 && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      MCP Tools Used:
                    </Typography>
                    {message.mcpTools.map((tool, index) => (
                      <Paper
                        key={index}
                        variant="outlined"
                        sx={{ p: 1, mb: 1, bgcolor: 'background.default' }}
                      >
                        <Typography variant="body2" fontWeight="medium">
                          {tool.name}
                        </Typography>
                        {tool.result && (
                          <Box sx={{ mt: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                Standard Output:
                              </Typography>
                              <Tooltip title={copiedStates[`${message.id}-${index}`] ? 'Copied!' : 'Copy to clipboard'}>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    const text = typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2);
                                    handleCopy(text, `${message.id}-${index}`);
                                  }}
                                  sx={{ 
                                    p: 0.5,
                                    color: copiedStates[`${message.id}-${index}`] ? 'success.main' : 'text.secondary',
                                  }}
                                >
                                  {copiedStates[`${message.id}-${index}`] ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                            <Box
                              sx={{
                                height: '150px', // Fixed height for exactly 10 lines
                                overflow: 'auto',
                                bgcolor: 'grey.100',
                                p: 1,
                                borderRadius: 1,
                                border: 1,
                                borderColor: 'grey.300',
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                lineHeight: '15px', // 15px per line = 150px for 10 lines
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                scrollbarWidth: 'auto',
                                '&::-webkit-scrollbar': {
                                  width: '8px',
                                },
                                '&::-webkit-scrollbar-track': {
                                  backgroundColor: '#f1f1f1',
                                  borderRadius: '4px',
                                },
                                '&::-webkit-scrollbar-thumb': {
                                  backgroundColor: '#888',
                                  borderRadius: '4px',
                                  '&:hover': {
                                    backgroundColor: '#555',
                                  },
                                },
                              }}
                            >
                              {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                            </Box>
                          </Box>
                        )}
                        {tool.error && (
                          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                            Error: {tool.error}
                          </Typography>
                        )}
                      </Paper>
                    ))}
                  </Box>
                )}
              </Paper>
            </Box>
          ))
        )}

        {isLoading && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Avatar
              sx={{
                bgcolor: 'secondary.main',
                width: 32,
                height: 32,
              }}
            >
              <BotIcon fontSize="small" />
            </Avatar>
            <Paper
              elevation={1}
              sx={{
                p: 2,
                bgcolor: 'grey.50',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Thinking...
              </Typography>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default MessageList;
