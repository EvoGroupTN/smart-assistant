import React, { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Alert,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { ChatSettings, MCPServer } from '../types';
import apiService from '../services/api';
import GitHubAuth from './GitHubAuth';

interface MCPToolsPanelProps {
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  onClose: () => void;
}

const MCPToolsPanel: React.FC<MCPToolsPanelProps> = ({
  settings,
  onSettingsChange,
  onClose,
}) => {
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const [configContent, setConfigContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedAIService, setSelectedAIService] = useState('openrouter');
  const queryClient = useQueryClient();

  // Fetch MCP servers
  const {
    data: serversData,
    isLoading: serversLoading,
    error: serversError,
  } = useQuery('mcp-servers', () => apiService.getMCPServers(), {
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch available tools
  const {
    data: toolsData,
    isLoading: toolsLoading,
    error: toolsError,
  } = useQuery('mcp-tools', () => apiService.getMCPTools(), {
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch current config
  const {
    isLoading: configLoading,
    error: configError,
    refetch: refetchConfig,
  } = useQuery(
    'mcp-config',
    () => apiService.getMCPConfig(),
    {
      enabled: configEditorOpen,
      onSuccess: (data) => {
        if (data.success) {
          const content = JSON.stringify(data.data.config, null, 2);
          setConfigContent(content);
          setOriginalContent(content);
          setHasChanges(false);
        }
      },
    }
  );

  // Save config mutation
  const saveConfigMutation = useMutation(
    (newConfig: string) => apiService.updateMCPConfig(newConfig),
    {
      onSuccess: (data) => {
        if (data.success) {
          setSaveSuccess(true);
          setSaveError(null);
          setOriginalContent(configContent);
          setHasChanges(false);
          
          // Refresh servers after config update
          queryClient.invalidateQueries('mcp-servers');
          queryClient.invalidateQueries('mcp-tools');
          
          setTimeout(() => setSaveSuccess(false), 3000);
        } else {
          setSaveError(data.error || 'Failed to save configuration');
        }
      },
      onError: (error: any) => {
        setSaveError(error.message || 'Failed to save configuration');
      },
    }
  );

  // Connect/disconnect mutations
  const connectMutation = useMutation(
    (serverId: string) => apiService.connectToMCPServer(serverId),
    {
      onSuccess: async () => {
        console.log('Server connected successfully, refreshing tools...');
        
        // Clear cache completely to force fresh data
        queryClient.removeQueries('mcp-servers');
        queryClient.removeQueries('mcp-tools');
        
        // Wait a moment for the server to complete tool discovery
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Force fresh fetch of both servers and tools
        await queryClient.refetchQueries('mcp-servers');
        await queryClient.refetchQueries('mcp-tools');
        
        console.log('Tools refresh completed');
      },
    }
  );

  const disconnectMutation = useMutation(
    (serverId: string) => apiService.disconnectFromMCPServer(serverId),
    {
      onSuccess: async () => {
        console.log('Server disconnected successfully, refreshing tools...');
        
        // Clear cache completely to force fresh data
        queryClient.removeQueries('mcp-servers');
        queryClient.removeQueries('mcp-tools');
        
        // Force fresh fetch of both servers and tools
        await queryClient.refetchQueries('mcp-servers');
        await queryClient.refetchQueries('mcp-tools');
        
        console.log('Tools refresh completed');
      },
    }
  );

  const servers = serversData?.data?.servers || [];
  const tools = toolsData?.data?.tools || [];

  console.log('MCPToolsPanel - Servers:', servers);
  console.log('MCPToolsPanel - Tools:', tools);
  console.log('MCPToolsPanel - Selected tools:', settings.selectedMCPTools);

  const handleServerToggle = (server: MCPServer) => {
    if (server.status === 'connected') {
      disconnectMutation.mutate(server.id);
      // Remove from activated servers when disconnecting
      const newActivatedServers = settings.activatedMCPServers.filter(id => id !== server.id);
      onSettingsChange({
        ...settings,
        activatedMCPServers: newActivatedServers,
      });
    } else {
      connectMutation.mutate(server.id);
      // Add to activated servers when connecting
      const newActivatedServers = [...settings.activatedMCPServers];
      if (!newActivatedServers.includes(server.id)) {
        newActivatedServers.push(server.id);
      }
      onSettingsChange({
        ...settings,
        activatedMCPServers: newActivatedServers,
      });
    }
  };

  const handleToolToggle = (toolName: string) => {
    const currentTools = settings.selectedMCPTools;
    const newTools = currentTools.includes(toolName)
      ? currentTools.filter(t => t !== toolName)
      : [...currentTools, toolName];
    
    onSettingsChange({
      ...settings,
      selectedMCPTools: newTools,
    });
  };

  const handleAutoExecuteToggle = (toolName: string) => {
    const currentTools = settings.autoExecuteTools;
    const newTools = currentTools.includes(toolName)
      ? currentTools.filter(t => t !== toolName)
      : [...currentTools, toolName];
    
    onSettingsChange({
      ...settings,
      autoExecuteTools: newTools,
    });
  };

  const handleAIServiceChange = async (service: string) => {
    setSelectedAIService(service);
    try {
      await apiService.setAIService(service);
    } catch (error) {
      console.error('Failed to set AI service', error);
    }
  };



  const refreshData = () => {
    queryClient.invalidateQueries('mcp-servers');
    queryClient.invalidateQueries('mcp-tools');
  };

  const handleConfigChange = (value: string) => {
    setConfigContent(value);
    setHasChanges(value !== originalContent);
    setSaveError(null);
    
    // Real-time JSON validation
    if (value.trim() === '') {
      setValidationError(null);
      return;
    }
    
    try {
      JSON.parse(value);
      setValidationError(null);
    } catch (error: any) {
      setValidationError(`JSON Syntax Error: ${error.message}`);
    }
  };

  const handleSaveConfig = () => {
    try {
      // Validate JSON
      JSON.parse(configContent);
      saveConfigMutation.mutate(configContent);
    } catch (error: any) {
      setSaveError(`Invalid JSON: ${error.message}`);
    }
  };

  const handleCloseConfig = () => {
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        setConfigEditorOpen(false);
        setSaveError(null);
        setSaveSuccess(false);
      }
    } else {
      setConfigEditorOpen(false);
      setSaveError(null);
      setSaveSuccess(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Settings & Tools</Typography>
          <Box>
            <IconButton size="small" onClick={refreshData}>
              <RefreshIcon />
            </IconButton>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">AI Service</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormControl fullWidth>
              <InputLabel id="ai-service-select-label">AI Service</InputLabel>
              <Select
                labelId="ai-service-select-label"
                id="ai-service-select"
                value={selectedAIService}
                label="AI Service"
                onChange={(e) => handleAIServiceChange(e.target.value)}
              >
                <MenuItem value="openrouter">OpenRouter</MenuItem>
                <MenuItem value="copilot">Copilot</MenuItem>
              </Select>
            </FormControl>
          </AccordionDetails>
        </Accordion>

        {/* GitHub Authentication */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">GitHub Authentication</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <GitHubAuth />
          </AccordionDetails>
        </Accordion>


        {/* MCP Servers */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <Typography variant="subtitle1">
                MCP Servers ({servers.length})
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsIcon />}
                onClick={() => setConfigEditorOpen(true)}
                sx={{ mr: 1 }}
              >
                Edit Config
              </Button>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {serversLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : serversError ? (
              <Alert severity="error" sx={{ m: 2 }}>
                Failed to load MCP servers
              </Alert>
            ) : servers.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No MCP servers configured
              </Typography>
            ) : (
              <List dense>
                {servers.map((server) => (
                  <ListItem key={server.id}>
                    <ListItemText
                      primary={server.name}
                      secondary={`${server.transport} • ${server.tools.length} tools • Status: ${server.status}`}
                    />
                    <ListItemSecondaryAction>
                      <Switch
                        checked={server.status === 'connected'}
                        onChange={() => handleServerToggle(server)}
                        disabled={
                          connectMutation.isLoading || disconnectMutation.isLoading
                        }
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Available Tools */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              Available Tools ({tools.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {toolsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : toolsError ? (
              <Alert severity="error" sx={{ m: 2 }}>
                Failed to load tools
              </Alert>
            ) : tools.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No tools available. Connect to MCP servers to see tools.
              </Typography>
            ) : (
              <List dense>
                {tools.map((tool) => (
                  <ListItem key={tool.name}>
                    <ListItemText
                      primary={tool.name}
                      secondary={tool.description}
                    />
                    <ListItemSecondaryAction>
                      <Switch
                        checked={settings.selectedMCPTools.includes(tool.name)}
                        onChange={() => handleToolToggle(tool.name)}
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Selected Tools Summary */}
        {settings.selectedMCPTools.length > 0 && (
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Tools ({settings.selectedMCPTools.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {settings.selectedMCPTools.map((toolName) => (
                <Chip
                  key={toolName}
                  label={toolName}
                  size="small"
                  onDelete={() => handleToolToggle(toolName)}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Auto-Execution Settings */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              Auto-Execution Settings
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Box sx={{ p: 2 }}>
              <ListItem sx={{ px: 0 }}>
                <ListItemText
                  primary="Require confirmation for all tools"
                  secondary="When enabled, all tool calls will require user confirmation"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={settings.requireConfirmationForAll}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      requireConfirmationForAll: e.target.checked
                    })}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              {!settings.requireConfirmationForAll && (
                <>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Auto-Execute Tools (Safe Tools)
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    These tools will execute automatically without confirmation:
                  </Typography>
                  
                  <List dense>
                    {tools.map((tool) => (
                      <ListItem key={tool.name} sx={{ px: 0 }}>
                        <ListItemText
                          primary={tool.name}
                          secondary={tool.description}
                        />
                        <ListItemSecondaryAction>
                          <Switch
                            checked={settings.autoExecuteTools.includes(tool.name)}
                            onChange={() => handleAutoExecuteToggle(tool.name)}
                          />
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                  
                  {settings.autoExecuteTools.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Auto-Execute Tools ({settings.autoExecuteTools.length})
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {settings.autoExecuteTools.map((toolName) => (
                          <Chip
                            key={toolName}
                            label={toolName}
                            size="small"
                            onDelete={() => handleAutoExecuteToggle(toolName)}
                            color="success"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* MCP Config Editor Dialog */}
      <Dialog
        open={configEditorOpen}
        onClose={handleCloseConfig}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { height: '80vh' }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">MCP Server Configuration</Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => refetchConfig()}
              disabled={configLoading}
            >
              Refresh
            </Button>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {configLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : configError ? (
            <Alert severity="error">
              Failed to load configuration: {(configError as Error).message}
            </Alert>
          ) : (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {saveError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {saveError}
                </Alert>
              )}
              {saveSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Configuration saved successfully!
                </Alert>
              )}
              {validationError && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {validationError}
                </Alert>
              )}
              
              <TextField
                multiline
                variant="outlined"
                value={configContent}
                onChange={(e) => handleConfigChange(e.target.value)}
                placeholder="Enter MCP server configuration in JSON format..."
                sx={{
                  flexGrow: 1,
                  '& .MuiInputBase-root': {
                    height: '100%',
                    alignItems: 'flex-start',
                    overflow: 'hidden',
                  },
                  '& .MuiInputBase-input': {
                    height: '100% !important',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    overflow: 'auto !important',
                    resize: 'none',
                    scrollbarWidth: 'thin',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      height: '8px',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: '#f1f1f1',
                      borderRadius: '4px',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: '#c1c1c1',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: '#a8a8a8',
                      },
                    },
                  },
                }}
                helperText={
                  hasChanges ? 
                  "⚠️ You have unsaved changes" : 
                  "Edit the MCP server configuration in JSON format"
                }
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseConfig}>
            Close
          </Button>
          <Button
            onClick={handleSaveConfig}
            variant="contained"
            disabled={!hasChanges || configLoading || saveConfigMutation.isLoading || !!validationError}
          >
            {saveConfigMutation.isLoading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MCPToolsPanel;
