import axios from 'axios';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface CopilotTokenResponse {
  token: string;
  expires_at: number;
}

export class GitHubAuthService {
  private readonly clientId = 'Iv1.b507a08c87ecfe98'; // GitHub Copilot CLI client ID
  private readonly baseUrl = 'https://github.com';

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/login/device/code`,
        {
          client_id: this.clientId,
          scope: 'copilot'
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Failed to request device code:', error);
      throw new Error(`Device code request failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async pollForAccessToken(deviceCode: string, interval: number = 5): Promise<AccessTokenResponse> {
    try {
      console.log(`Making single token check for device code: ${deviceCode}`);
      const response = await axios.post(
        `${this.baseUrl}/login/oauth/access_token`,
        {
          client_id: this.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`GitHub OAuth response:`, response.data);

      if (response.data.access_token) {
        console.log('Access token received successfully');
        return response.data;
      }

      if (response.data.error === 'authorization_pending') {
        console.log('Authorization still pending');
        throw new Error('authorization_pending');
      }

      if (response.data.error === 'slow_down') {
        console.log('Rate limit - slowing down');
        throw new Error('slow_down');
      }

      if (response.data.error === 'expired_token') {
        console.log('Device code expired');
        throw new Error(`expired_token: ${response.data.error_description}`);
      }

      if (response.data.error === 'access_denied') {
        console.log('Access denied by user');
        throw new Error(`access_denied: ${response.data.error_description}`);
      }

      console.log('Unexpected response:', response.data);
      throw new Error(`Unexpected response: ${JSON.stringify(response.data)}`);

    } catch (error: any) {
      if (error.response?.data?.error) {
        const errorData = error.response.data;
        console.log('GitHub OAuth error response:', errorData);
        
        if (errorData.error === 'authorization_pending') {
          throw new Error('authorization_pending');
        }

        if (errorData.error === 'slow_down') {
          throw new Error('slow_down');
        }

        if (errorData.error === 'expired_token' || errorData.error === 'access_denied') {
          throw new Error(`${errorData.error}: ${errorData.error_description}`);
        }
      }

      console.error('Token polling error:', error);
      throw new Error(`Token polling failed: ${error.message}`);
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.status === 200;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw new Error('Failed to retrieve user information');
    }
  }

  async generateCopilotToken(githubToken: string): Promise<string> {
    try {
      console.log('Generating new Copilot token using GitHub token');
      
      // Get a new Copilot token using the GitHub token
      const response = await axios.get('https://api.github.com/copilot_internal/v2/token', {
        headers: {
          'Authorization': `token ${githubToken}`,
          'User-Agent': 'GithubCopilot/1.155.0',
          'Editor-Version': 'vscode/1.80.1',
          'Editor-Plugin-Version': 'copilot.vim/1.16.0',
          'Accept': 'application/json'
        }
      });
      
      if (!response || response.status !== 200) {
        throw new Error(`Failed to get Copilot token: ${response?.statusText || 'Unknown error'}`);
      }
      
      const data = response.data as CopilotTokenResponse;
      console.log('Copilot token generated successfully, expires at:', new Date(data.expires_at * 1000).toISOString());
      
      // Store the token with expiration
      await this.saveCopilotToken(data.token, data.expires_at);
      
      return data.token;
    } catch (error: any) {
      console.error('Failed to generate Copilot token:', error);
      if (error.response?.status === 403) {
        throw new Error('GitHub Copilot is not enabled for this account. Please enable GitHub Copilot in your GitHub account settings.');
      }
      if (error.response?.status === 401) {
        throw new Error('GitHub token is invalid or expired. Please re-authenticate.');
      }
      throw new Error(`Failed to generate Copilot token: ${error.response?.data?.message || error.message}`);
    }
  }

  async getCopilotToken(): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const tokenPath = path.resolve(process.cwd(), '.copilot-token.json');
      const tokenData = JSON.parse(await fs.readFile(tokenPath, 'utf-8'));
      
      // Check if token is expired (with 5 minute buffer)
      const now = Math.floor(Date.now() / 1000);
      const bufferTime = 5 * 60; // 5 minutes
      
      if (tokenData.expires_at && (tokenData.expires_at - bufferTime) > now) {
        console.log('Using cached Copilot token');
        return tokenData.token;
      } else {
        console.log('Cached Copilot token is expired or about to expire');
        return null;
      }
    } catch (error) {
      console.log('No cached Copilot token found or error reading token');
      return null;
    }
  }

  async saveCopilotToken(token: string, expiresAt: number): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const tokenPath = path.resolve(process.cwd(), '.copilot-token.json');
      const tokenData = {
        token,
        expires_at: expiresAt,
        created_at: Math.floor(Date.now() / 1000)
      };
      
      await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
      console.log('Copilot token saved to cache');
    } catch (error) {
      console.error('Failed to save Copilot token:', error);
    }
  }

  async getValidCopilotToken(): Promise<string> {
    // First, try to get cached token
    let copilotToken = await this.getCopilotToken();
    
    if (copilotToken) {
      return copilotToken;
    }

    // If no valid cached token, generate a new one
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('No GitHub token available. Please authenticate first.');
    }

    // Generate new Copilot token
    copilotToken = await this.generateCopilotToken(githubToken);
    return copilotToken;
  }

  async clearCopilotToken(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const tokenPath = path.resolve(process.cwd(), '.copilot-token.json');
      await fs.unlink(tokenPath);
      console.log('Copilot token cache cleared');
    } catch (error) {
      // File doesn't exist, which is fine
    }
  }
}

export const authService = new GitHubAuthService();
