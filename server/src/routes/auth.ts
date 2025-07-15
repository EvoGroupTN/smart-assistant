import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// In-memory storage for device codes (in production, use Redis or database)
const deviceCodeSessions = new Map<string, {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  interval: number;
}>();

// Request device code for GitHub OAuth
router.post('/device/code', async (req: Request, res: Response) => {
  try {
    const deviceCodeResponse = await authService.requestDeviceCode();
    
    // Store session for polling
    const sessionId = Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + deviceCodeResponse.expires_in * 1000);
    
    deviceCodeSessions.set(sessionId, {
      deviceCode: deviceCodeResponse.device_code,
      userCode: deviceCodeResponse.user_code,
      verificationUri: deviceCodeResponse.verification_uri,
      expiresAt,
      interval: deviceCodeResponse.interval
    });

    res.json({
      success: true,
      data: {
        sessionId,
        userCode: deviceCodeResponse.user_code,
        verificationUri: deviceCodeResponse.verification_uri,
        expiresIn: deviceCodeResponse.expires_in,
        interval: deviceCodeResponse.interval
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Device code request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to request device code',
      message: error.message
    });
  }
});

// Poll for access token
router.post('/device/token', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const session = deviceCodeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    if (new Date() > session.expiresAt) {
      deviceCodeSessions.delete(sessionId);
      return res.status(410).json({
        success: false,
        error: 'Device code expired'
      });
    }

    console.log(`Polling for token with session ${sessionId}, device code ${session.deviceCode}`);
    
    try {
      const tokenResponse = await authService.pollForAccessToken(session.deviceCode, session.interval);
      
      console.log('Token response received:', { 
        hasAccessToken: !!tokenResponse.access_token,
        tokenType: tokenResponse.token_type,
        scope: tokenResponse.scope 
      });
      
      // Clean up session
      deviceCodeSessions.delete(sessionId);

      // Get user info
      const userInfo = await authService.getUserInfo(tokenResponse.access_token);
      console.log('User info retrieved:', { login: userInfo.login, name: userInfo.name });

      // Save token to .env file
      await saveTokenToEnv(tokenResponse.access_token);
      console.log('Token saved to .env file');

      // Generate initial Copilot token
      try {
        console.log('Generating initial Copilot token...');
        await authService.generateCopilotToken(tokenResponse.access_token);
        console.log('Initial Copilot token generated successfully');
      } catch (copilotError) {
        console.warn('Failed to generate initial Copilot token (will retry on first use):', copilotError);
        // Don't fail the authentication if Copilot token generation fails
      }

      res.json({
        success: true,
        data: {
          accessToken: tokenResponse.access_token,
          tokenType: tokenResponse.token_type,
          scope: tokenResponse.scope,
          user: {
            login: userInfo.login,
            name: userInfo.name,
            email: userInfo.email,
            avatarUrl: userInfo.avatar_url
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (tokenError: any) {
      console.error('Token polling error details:', tokenError);
      throw tokenError;
    }

  } catch (error: any) {
    console.error('Token polling error:', error);
    
    // Handle specific OAuth errors
    if (error.message.includes('authorization_pending')) {
      return res.status(202).json({
        success: false,
        error: 'authorization_pending',
        message: 'User has not yet completed authorization'
      });
    }

    if (error.message.includes('slow_down')) {
      return res.status(202).json({
        success: false,
        error: 'slow_down',
        message: 'Polling too frequently, slow down'
      });
    }

    if (error.message.includes('access_denied') || error.message.includes('expired_token')) {
      return res.status(403).json({
        success: false,
        error: 'authorization_failed',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Token request failed',
      message: error.message
    });
  }
});

// Validate current token
router.get('/validate', async (req: Request, res: Response) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    
    if (!token) {
      return res.json({
        success: true,
        data: {
          isValid: false,
          message: 'No token configured'
        }
      });
    }

    const isValid = await authService.validateToken(token);
    
    if (isValid) {
      const userInfo = await authService.getUserInfo(token);
      res.json({
        success: true,
        data: {
          isValid: true,
          user: {
            login: userInfo.login,
            name: userInfo.name,
            email: userInfo.email,
            avatarUrl: userInfo.avatar_url
          }
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          isValid: false,
          message: 'Token is invalid or expired'
        }
      });
    }

  } catch (error: any) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Token validation failed',
      message: error.message
    });
  }
});

// Logout (clear token)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    await removeTokenFromEnv();
    
    // Also clear the cached Copilot token
    await authService.clearCopilotToken();
    
    res.json({
      success: true,
      message: 'Successfully logged out',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    });
  }
});

// Helper function to save token to .env file
async function saveTokenToEnv(token: string): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = '';
  
  try {
    envContent = await fs.readFile(envPath, 'utf-8');
  } catch (error) {
    // File doesn't exist, will create new one
  }

  const lines = envContent.split('\n');
  let tokenLineFound = false;

  // Update existing GITHUB_TOKEN line or add new one
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('GITHUB_TOKEN=')) {
      lines[i] = `GITHUB_TOKEN=${token}`;
      tokenLineFound = true;
      break;
    }
  }

  if (!tokenLineFound) {
    lines.push(`GITHUB_TOKEN=${token}`);
  }

  await fs.writeFile(envPath, lines.join('\n'));
  
  // Update process.env for immediate use
  process.env.GITHUB_TOKEN = token;
}

// Helper function to remove token from .env file
async function removeTokenFromEnv(): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');
  
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const lines = envContent.split('\n').filter(line => !line.startsWith('GITHUB_TOKEN='));
    await fs.writeFile(envPath, lines.join('\n'));
    
    // Update process.env
    delete process.env.GITHUB_TOKEN;
  } catch (error) {
    console.error('Error removing token from .env:', error);
  }
}

export default router;
