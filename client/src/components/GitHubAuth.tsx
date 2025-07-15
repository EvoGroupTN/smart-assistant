import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  Divider,
  TextField,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  GitHub as GitHubIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import apiService from '../services/api';

interface AuthState {
  isAuthenticated: boolean;
  user?: {
    login: string;
    name: string;
    email: string;
    avatarUrl: string;
  };
  isLoading: boolean;
  error?: string;
}

interface DeviceCodeData {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

const GitHubAuth: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
  });
  const [deviceCode, setDeviceCode] = useState<DeviceCodeData | null>(null);
  const [showDeviceFlow, setShowDeviceFlow] = useState(false);
  const [pollInterval, setPollInterval] = useState<(() => void) | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const queryClient = useQueryClient();

  // Check current authentication status
  const { refetch: checkAuth } = useQuery(
    'auth-status',
    () => apiService.validateAuth(),
    {
      onSuccess: (response) => {
        if (response.success && response.data.isValid) {
          setAuthState({
            isAuthenticated: true,
            user: response.data.user,
            isLoading: false,
          });
        } else {
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            error: response.data.message,
          });
        }
      },
      onError: (error: any) => {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          error: error.message,
        });
      },
      retry: false,
    }
  );

  // Request device code mutation
  const requestDeviceCodeMutation = useMutation(
    () => apiService.requestDeviceCode(),
    {
      onSuccess: (response) => {
        if (response.success) {
          setDeviceCode(response.data);
          setTimeRemaining(response.data.expiresIn);
          setShowDeviceFlow(true);
          startPolling(response.data);
        }
      },
      onError: (error: any) => {
        setAuthState(prev => ({
          ...prev,
          error: error.response?.data?.message || 'Failed to request device code',
        }));
      },
    }
  );

  // Poll for token mutation
  const pollTokenMutation = useMutation(
    (sessionId: string) => apiService.pollForToken(sessionId),
    {
      onSuccess: (response) => {
        console.log('Poll response:', response);
        if (response.success) {
          // Authentication successful
          console.log('Authentication successful:', response.data);
          setAuthState({
            isAuthenticated: true,
            user: response.data.user,
            isLoading: false,
          });
          setShowDeviceFlow(false);
          setDeviceCode(null);
          stopPolling();
          queryClient.invalidateQueries('auth-status');
        }
      },
      onError: (error: any) => {
        console.log('Poll error:', error);
        const status = error.response?.status;
        const errorType = error.response?.data?.error;
        
        console.log('Poll error details:', { status, errorType, message: error.response?.data?.message });
        
        if (status === 202 && (errorType === 'authorization_pending' || errorType === 'slow_down')) {
          // Continue polling - these are expected during the flow
          console.log('Continuing polling...');
          return;
        }
        
        // Stop polling on real errors
        console.log('Stopping polling due to error');
        stopPolling();
        setAuthState(prev => ({
          ...prev,
          error: error.response?.data?.message || 'Authentication failed',
        }));
        setShowDeviceFlow(false);
      },
    }
  );

  // Logout mutation
  const logoutMutation = useMutation(
    () => apiService.logout(),
    {
      onSuccess: () => {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
        });
        queryClient.invalidateQueries('auth-status');
      },
      onError: (error: any) => {
        setAuthState(prev => ({
          ...prev,
          error: error.response?.data?.message || 'Logout failed',
        }));
      },
    }
  );

  const startPolling = (deviceCodeData: DeviceCodeData) => {
    const interval = setInterval(() => {
      pollTokenMutation.mutate(deviceCodeData.sessionId);
    }, deviceCodeData.interval * 2000);

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          stopPolling();
          setShowDeviceFlow(false);
          setAuthState(prev => ({
            ...prev,
            error: 'Device code expired. Please try again.',
          }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Store cleanup function for both intervals
    setPollInterval(() => () => {
      clearInterval(interval);
      clearInterval(countdownInterval);
    });
  };

  const stopPolling = () => {
    if (pollInterval) {
      if (typeof pollInterval === 'function') {
        pollInterval();
      } else {
        clearInterval(pollInterval);
      }
      setPollInterval(null);
    }
  };

  const handleLogin = () => {
    setAuthState(prev => ({ ...prev, error: undefined }));
    requestDeviceCodeMutation.mutate();
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  if (authState.isLoading) {
    return (
      <Box display="flex" alignItems="center" gap={2}>
        <CircularProgress size={20} />
        <Typography variant="body2">Checking authentication...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {authState.error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAuthState(prev => ({ ...prev, error: undefined }))}>
          {authState.error}
        </Alert>
      )}

      {authState.isAuthenticated && authState.user ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Avatar src={authState.user.avatarUrl} sx={{ width: 40, height: 40 }}>
              <GitHubIcon />
            </Avatar>
            <Box flexGrow={1}>
              <Typography variant="subtitle1" fontWeight="bold">
                {authState.user.name || authState.user.login}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {authState.user.login}
              </Typography>
            </Box>
            <Chip label="Authenticated" color="success" size="small" />
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            disabled={logoutMutation.isLoading}
            fullWidth
          >
            {logoutMutation.isLoading ? 'Logging out...' : 'Logout'}
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box textAlign="center" mb={2}>
            <GitHubIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              GitHub Copilot Authentication
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Connect your GitHub account to use Copilot API
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={handleLogin}
            disabled={requestDeviceCodeMutation.isLoading}
            fullWidth
          >
            {requestDeviceCodeMutation.isLoading ? 'Requesting...' : 'Login with GitHub'}
          </Button>
        </Paper>
      )}

      {/* Device Flow Dialog */}
      <Dialog open={showDeviceFlow} onClose={() => setShowDeviceFlow(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <GitHubIcon />
            GitHub Device Authorization
          </Box>
        </DialogTitle>
        <DialogContent>
          {deviceCode && (
            <Box>
              <Alert severity="info" sx={{ mb: 3 }}>
                Complete the authorization in your browser, then return here.
              </Alert>

              <Box mb={3}>
                <Typography variant="subtitle2" gutterBottom>
                  1. Visit the verification URL:
                </Typography>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <TextField
                    value={deviceCode.verificationUri}
                    InputProps={{ readOnly: true }}
                    size="small"
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CopyIcon />}
                    onClick={() => copyToClipboard(deviceCode.verificationUri)}
                  >
                    Copy
                  </Button>
                </Box>
                <Link
                  href={deviceCode.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ fontSize: '0.875rem' }}
                >
                  Open in new tab →
                </Link>
              </Box>

              <Box mb={3}>
                <Typography variant="subtitle2" gutterBottom>
                  2. Enter this device code:
                </Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <TextField
                    value={deviceCode.userCode}
                    InputProps={{ readOnly: true }}
                    size="small"
                    sx={{ fontFamily: 'monospace' }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CopyIcon />}
                    onClick={() => copyToClipboard(deviceCode.userCode)}
                  >
                    Copy
                  </Button>
                </Box>
              </Box>

              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box display="flex" alignItems="center" gap={1}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">
                    Waiting for authorization...
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Expires in {formatTime(timeRemaining)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeviceFlow(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GitHubAuth;
