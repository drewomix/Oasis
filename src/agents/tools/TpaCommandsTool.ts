import { Tool } from '@langchain/core/tools';
import axios from 'axios';
import { z } from 'zod';

const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;
const PACKAGE_NAME = process.env.PACKAGE_NAME;

console.log("$$$$$ AUGMENTOS_API_KEY:", AUGMENTOS_API_KEY);
console.log("$$$$$ PACKAGE_NAME:", PACKAGE_NAME);

const ACTIONS = ['start', 'stop'] as const;

interface AppInfo {
  packageName: string;
  name: string;
  description: string;
  is_running: boolean;
}

const TpaCommandsInputSchema = z.object({
  action: z.enum(ACTIONS),
  packageName: z.string(),
});

export class TpaCommandsTool extends Tool {
  name = 'TPA_Commands';
  description = 'Start or stop apps on smart glasses. Use this tool when a user asks to close, open, start, or stop an app. Input: { "action": "start"|"stop", "packageName": string } or a string like "close this app" or "stop [app name]".';
  private userId: string;
  private cloudUrl: string;

  constructor(cloudUrl: string, userId: string) {
    super();
    this.cloudUrl = cloudUrl;
    this.userId = userId;
  }

  async _call(input: string): Promise<string> {
    try {
      // Try to parse as JSON first
      let params: { action: string, packageName: string };
      
      try {
        params = TpaCommandsInputSchema.parse(JSON.parse(input));
      } catch (e) {
        // If not valid JSON or doesn't match schema, handle as text command
        return await this.handleTextCommand(input);
      }
      
      // If we got here, we have valid params from JSON
      return await this.executeCommand(params.action, params.packageName);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.message || error.message;
        return `Error: ${errorMessage}`;
      }
      return `Unknown error: ${error}`;
    }
  }

  private async handleTextCommand(text: string): Promise<string> {
    const lowerText = text.toLowerCase();
    
    // First get all apps to work with
    const apps = await this.getAllApps();

    console.log("$$$$$ apps:", apps);
    console.log("[TPA_Commands] User command:", text);
    
    // Handle common command patterns
    if (lowerText.includes('close') || lowerText.includes('stop')) {
      // Look for a running app that matches the description
      const runningApps = apps.filter(app => app.is_running);
      
      if (runningApps.length === 0) {
        return "No apps are currently running.";
      }
      
      // If specific app mentioned, try to find it
      for (const app of runningApps) {
        if (lowerText.includes(app.name.toLowerCase())) {
          console.log(`[TPA_Commands] Attempting to stop app: ${app.name} (${app.packageName})`);
          return await this.executeCommand('stop', app.packageName);
        }
      }
      
      // If "this app" or generic close request, take the first running app
      if (lowerText.includes('this app') || lowerText.includes('current app')) {
        const foregroundApp = runningApps.find(app => (app as any).is_foreground);
        if (foregroundApp) {
          console.log(`[TPA_Commands] Attempting to stop foreground app: ${foregroundApp.name} (${foregroundApp.packageName})`);
          return await this.executeCommand('stop', foregroundApp.packageName);
        } else {
          // Just stop the first running app if no foreground app found
          console.log(`[TPA_Commands] Attempting to stop first running app: ${runningApps[0].name} (${runningApps[0].packageName})`);
          return await this.executeCommand('stop', runningApps[0].packageName);
        }
      }
      
      // If we got here, we couldn't identify which app to stop
      return `Found ${runningApps.length} running apps. Please specify which app to stop: ${runningApps.map(a => a.name).join(', ')}`;
    } 
    else if (lowerText.includes('open') || lowerText.includes('start')) {
      // Similar logic for starting apps
      for (const app of apps) {
        if (lowerText.includes(app.name.toLowerCase())) {
          console.log(`[TPA_Commands] Attempting to start app: ${app.name} (${app.packageName})`);
          return await this.executeCommand('start', app.packageName);
        }
      }
      
      return `Please specify which app to start. Available apps: ${apps.map(a => a.name).join(', ')}`;
    }
    
    return "Invalid command. Please use 'stop [app name]' or 'start [app name]' or provide valid JSON.";
  }

  private async getAllApps(): Promise<AppInfo[]> {
    try {
      // Use the correct API endpoint from the routes file
      const url = `${this.cloudUrl}/api/apps?apiKey=${AUGMENTOS_API_KEY}&packageName=${PACKAGE_NAME}&userId=${this.userId}`;
      const response = await axios.get(url);
      
      // Check if the response has the expected structure
      if (!response.data || !response.data.success) {
        console.error('Invalid response format from API:', response.data);
        return [];
      }
      
      // Extract app data from the response
      const apps = response.data.data || [];
      
      // Extract only the fields we need
      return apps.map((app: any) => ({
        packageName: app.packageName,
        name: app.name,
        description: app.description || '',
        is_running: !!app.is_running,
        is_foreground: !!app.is_foreground
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Error fetching apps:', error.response?.data || error.message);
      } else {
        console.error('Error fetching apps:', error);
      }
      return [];
    }
  }

  private async executeCommand(action: string, packageName: string): Promise<string> {
    try {
      // Use the correct API endpoint from the routes file
      const url = `${this.cloudUrl}/api/apps/${packageName}/${action}?apiKey=${AUGMENTOS_API_KEY}&packageName=${PACKAGE_NAME}&userId=${this.userId}`;
      console.log(`[TPA_Commands] Executing command: ${action} for package: ${packageName}`);
      console.log(`[TPA_Commands] Request URL:`, url);
      const response = await axios.post(url);
      console.log(`[TPA_Commands] Response:`, response.data);
      // Check if the response indicates success
      if (response.data && response.data.success) {
        return `Successfully ${action === 'start' ? 'started' : 'stopped'} app ${packageName}`;
      } else {
        const message = response.data?.message || 'Unknown error';
        return `Failed to ${action} app: ${message}`;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[TPA_Commands] Axios error while trying to ${action} app ${packageName}:`, error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || error.message;
        return `Failed to ${action} app: ${errorMessage}`;
      }
      console.error(`[TPA_Commands] Unknown error while trying to ${action} app ${packageName}:`, error);
      return `Unknown error while trying to ${action} app: ${error}`;
    }
  }
}
