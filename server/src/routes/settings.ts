import { Router, Request, Response } from 'express';
import { settingsService, ChatSettings } from '../services/settingsService';
import { setActiveAIService } from '../server';

const router = Router();

// Get current settings
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('GET /api/settings - Loading settings');
    const settingsInfo = await settingsService.getSettingsInfo();
    
    res.json({
      success: true,
      data: settingsInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error loading settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load settings',
      timestamp: new Date().toISOString(),
    });
  }
});

// Update settings (partial update)
router.patch('/', async (req: Request, res: Response) => {
  try {
    console.log('PATCH /api/settings - Updating settings');
    console.log('Request body:', req.body);
    
    const updatedSettings = await settingsService.updateSettings(req.body);
    
    res.json({
      success: true,
      data: updatedSettings,
      message: 'Settings updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update settings',
      timestamp: new Date().toISOString(),
    });
  }
});

// Save complete settings (full update)
router.put('/', async (req: Request, res: Response) => {
  try {
    console.log('PUT /api/settings - Saving complete settings');
    console.log('Request body:', req.body);
    
    const settings: ChatSettings = req.body;
    await settingsService.saveSettings(settings);
    
    res.json({
      success: true,
      data: settings,
      message: 'Settings saved successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error saving settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
      timestamp: new Date().toISOString(),
    });
  }
});

// Reset settings to defaults
router.delete('/', async (req: Request, res: Response) => {
  try {
    console.log('DELETE /api/settings - Resetting settings to defaults');
    
    const defaultSettings: ChatSettings = {
      selectedMCPTools: [],
      autoExecuteTools: [],
      requireConfirmationForAll: false,
      activatedMCPServers: [],
    };
    
    await settingsService.saveSettings(defaultSettings);
    
    res.json({
      success: true,
      data: defaultSettings,
      message: 'Settings reset to defaults',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error resetting settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reset settings',
      timestamp: new Date().toISOString(),
    });
  }
});

// Get settings file path (for debugging)
router.get('/info', async (req: Request, res: Response) => {
  try {
    const settingsPath = settingsService.getSettingsPath();
    
    res.json({
      success: true,
      data: {
        settingsPath,
        exists: true, // Will be checked in the service
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error getting settings info:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get settings info',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/ai-service', (req: Request, res: Response) => {
  const { service } = req.body;
  if (service === 'copilot' || service === 'openrouter') {
    setActiveAIService(service);
    res.json({ success: true, message: `AI service set to ${service}` });
  } else {
    res.status(400).json({ success: false, error: 'Invalid AI service' });
  }
});

export default router;
