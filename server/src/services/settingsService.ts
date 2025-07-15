import { promises as fs } from 'fs';
import * as path from 'path';

export interface ChatSettings {
  selectedMCPTools: string[];
  autoExecuteTools: string[];
  requireConfirmationForAll: boolean;
  activatedMCPServers: string[];
}

const DEFAULT_SETTINGS: ChatSettings = {
  selectedMCPTools: [],
  autoExecuteTools: [],
  requireConfirmationForAll: false,
  activatedMCPServers: [],
};

export class SettingsService {
  private settingsPath: string;

  constructor() {
    // Store settings in the server directory
    this.settingsPath = path.join(process.cwd(), 'webchat-settings.json');
  }

  async loadSettings(): Promise<ChatSettings> {
    try {
      console.log(`Loading settings from: ${this.settingsPath}`);
      
      // Check if settings file exists
      await fs.access(this.settingsPath);
      
      // Read and parse settings file
      const settingsData = await fs.readFile(this.settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);
      
      // Merge with defaults to ensure all properties exist
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
      };
      
      console.log('Settings loaded successfully:', mergedSettings);
      return mergedSettings;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('Settings file not found, creating with defaults');
        await this.saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      } else {
        console.error('Failed to load settings:', error);
        console.log('Using default settings due to error');
        return DEFAULT_SETTINGS;
      }
    }
  }

  async saveSettings(settings: ChatSettings): Promise<void> {
    try {
      console.log(`Saving settings to: ${this.settingsPath}`);
      console.log('Settings to save:', settings);
      
      // Validate settings structure
      this.validateSettings(settings);
      
      // Write settings to file with pretty formatting
      const settingsData = JSON.stringify(settings, null, 2);
      await fs.writeFile(this.settingsPath, settingsData, 'utf-8');
      
      console.log('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new Error(`Failed to save settings: ${error}`);
    }
  }

  async updateSettings(partialSettings: Partial<ChatSettings>): Promise<ChatSettings> {
    try {
      // Load current settings
      const currentSettings = await this.loadSettings();
      
      // Merge with new settings
      const updatedSettings = {
        ...currentSettings,
        ...partialSettings,
      };
      
      // Save updated settings
      await this.saveSettings(updatedSettings);
      
      return updatedSettings;
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw new Error(`Failed to update settings: ${error}`);
    }
  }

  async getSettingsInfo(): Promise<{
    settings: ChatSettings;
    settingsPath: string;
    fileSize: number;
    lastModified: string;
  }> {
    try {
      const settings = await this.loadSettings();
      const stats = await fs.stat(this.settingsPath);
      
      return {
        settings,
        settingsPath: path.resolve(this.settingsPath),
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    } catch (error) {
      console.error('Failed to get settings info:', error);
      throw new Error(`Failed to get settings info: ${error}`);
    }
  }

  private validateSettings(settings: ChatSettings): void {
    if (typeof settings !== 'object' || settings === null) {
      throw new Error('Settings must be an object');
    }

    if (!Array.isArray(settings.selectedMCPTools)) {
      throw new Error('selectedMCPTools must be an array');
    }

    if (!Array.isArray(settings.autoExecuteTools)) {
      throw new Error('autoExecuteTools must be an array');
    }

    if (!Array.isArray(settings.activatedMCPServers)) {
      throw new Error('activatedMCPServers must be an array');
    }

    if (typeof settings.requireConfirmationForAll !== 'boolean') {
      throw new Error('requireConfirmationForAll must be a boolean');
    }

    // Validate that all items in arrays are strings
    if (!settings.selectedMCPTools.every(tool => typeof tool === 'string')) {
      throw new Error('All selectedMCPTools must be strings');
    }

    if (!settings.autoExecuteTools.every(tool => typeof tool === 'string')) {
      throw new Error('All autoExecuteTools must be strings');
    }

    if (!settings.activatedMCPServers.every(server => typeof server === 'string')) {
      throw new Error('All activatedMCPServers must be strings');
    }
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
