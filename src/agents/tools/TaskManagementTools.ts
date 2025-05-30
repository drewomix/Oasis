import { Tool } from '@langchain/core/tools';
import axios from 'axios';
import { z } from 'zod';
import 'dotenv/config';

// Environment variables or configuration
const CACTUS_API_BASE_URL = process.env.CACTUS_API_BASE_URL;
const CACTUS_API_EMAIL = process.env.CACTUS_API_EMAIL;
const CACTUS_API_PASSWORD = process.env.CACTUS_API_PASSWORD;
const CACTUS_DOMAIN_ID = process.env.CACTUS_DOMAIN_ID;

// Cache for auth token and domain mappings
let authToken: string | null = null;
let tokenExpiry: Date | null = null;
const domainCache: Map<string, string> = new Map();

// Input schemas
const FetchTasksInputSchema = z.object({
  domainId: z.string().describe('The domain ID (UUID format like 30db24d0-4b30-4de2-a209-3a6bb721cec7)'),
  filters: z.object({
    title: z.string().optional(),
    productId: z.string().optional(),
    assignedToProfile: z.string().optional(),
    assignedToTeam: z.string().optional(),
  }).optional(),
});

const CreateTaskInputSchema = z.object({
  domainId: z.string().describe('The domain ID (UUID format)'),
  title: z.string().describe('Title of the task'),
  body: z.string().optional().describe('Optional description of the task'),
  productId: z.string().optional().describe('Product ID to position the task'),
  pose: z.object({
    px: z.number().default(0),
    py: z.number().default(0),
    pz: z.number().default(0),
    rw: z.number().default(1),
    rx: z.number().default(0),
    ry: z.number().default(0),
    rz: z.number().default(0),
  }).optional(),
  dueDate: z.string().optional().describe('ISO format datetime string'),
  dueEnabled: z.boolean().optional(),
  assignToProfiles: z.array(z.string()).optional().describe('Array of profile emails to assign'),
  assignToTeams: z.array(z.string()).optional().describe('Array of team names to assign'),
});

// Helper functions
async function authenticate(): Promise<string> {
  // Check if we have a valid cached token
  if (authToken && tokenExpiry && tokenExpiry > new Date()) {
    return authToken;
  }

  if (!CACTUS_API_EMAIL || !CACTUS_API_PASSWORD) {
    throw new Error('Task API credentials not configured. Please set TASK_API_EMAIL and TASK_API_PASSWORD environment variables.');
  }

  try {
    const response = await axios.post(
      `${CACTUS_API_BASE_URL}/api/collections/users/auth-with-password`,
      {
        identity: CACTUS_API_EMAIL,
        password: CACTUS_API_PASSWORD,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    authToken = response.data.token;
    // Token is valid for 24 hours, but we'll refresh it after 23 hours to be safe
    tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
    
    if (!authToken) {
      throw new Error('Authentication failed: No token received');
    }
    
    return authToken;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

async function getProfileRecordIds(emails: string[], domainRecordId: string, token: string): Promise<string[]> {
  try {
    const response = await axios.get(
      `${CACTUS_API_BASE_URL}/api/collections/Profiles/records?filter=(domains?='${domainRecordId}')`,
      {
        headers: {
          Authorization: token,
        },
      }
    );

    const profileIds: string[] = [];
    for (const email of emails) {
      const profile = response.data.items.find((p: any) => p.email === email);
      if (profile) {
        profileIds.push(profile.id);
      }
    }

    return profileIds;
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return [];
  }
}

async function getTeamRecordIds(names: string[], domainRecordId: string, token: string): Promise<string[]> {
  try {
    const response = await axios.get(
      `${CACTUS_API_BASE_URL}/api/collections/Teams/records?filter=(domains?='${domainRecordId}')`,
      {
        headers: {
          Authorization: token,
        },
      }
    );

    const teamIds: string[] = [];
    for (const name of names) {
      const team = response.data.items.find((t: any) => t.name === name);
      if (team) {
        teamIds.push(team.id);
      }
    }

    return teamIds;
  } catch (error) {
    console.error('Error fetching teams:', error);
    return [];
  }
}

// Helper function to get the database record ID for a given domain UUID
async function getDomainDatabaseRecordId(domainUuid: string, token: string): Promise<string> {
  if (!domainUuid) {
    throw new Error('Domain UUID is required to fetch database record ID.');
  }
  // Check cache first (key by UUID, value is DB record ID)
  if (domainCache.has(domainUuid)) {
    return domainCache.get(domainUuid)!;
  }

  if (!CACTUS_API_BASE_URL) {
    throw new Error('CACTUS_API_BASE_URL is not set.');
  }

  try {
    const response = await axios.get(
      `${CACTUS_API_BASE_URL}/api/collections/Domains/records?filter=(DomainID='${domainUuid}')`,
      {
        headers: {
          Authorization: token,
        },
      }
    );

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Domain not found for UUID: ${domainUuid}`);
    }

    const recordId = response.data.items[0].id;
    if (!recordId) {
      throw new Error(`Database record ID not found for domain UUID: ${domainUuid}`);
    }
    domainCache.set(domainUuid, recordId); // Cache it
    return recordId;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to retrieve domain database record ID for UUID ${domainUuid}: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

// Fetch Tasks Tool
export class FetchTasksTool extends Tool {
  name = 'fetch_cactus_tasks';
  description = 'Fetch all tasks from Cactus. Trigger only when user asks for cactus tasks.';

  async _call(input: any): Promise<string> {
    try {
      // Only log raw input for debugging
      // console.debug('[FetchTasksTool] raw input:', input);
      const cactusDomainUuid = CACTUS_DOMAIN_ID;
      if (!cactusDomainUuid) {
        throw new Error('CACTUS_DOMAIN_ID environment variable is not set.');
      }
      const token = await authenticate();
      const domainRecordId = await getDomainDatabaseRecordId(cactusDomainUuid, token);

      let params: any = { filters: {} };
      if (input === undefined || input === null) {
        // Silent fallback to defaults
      } else if (typeof input === 'object') {
        params = { ...input };
      } else if (typeof input === 'string') {
        try {
          params = FetchTasksInputSchema.parse(JSON.parse(input));
        } catch (e) {
          // Silent fallback to defaults
        }
      }

      let filter = `(domain='${domainRecordId}')`;
      if (params.filters) {
        const filterParts: string[] = [filter];
        if (params.filters.title) {
          filterParts.push(`(title~'${params.filters.title}')`);
        }
        if (params.filters.productId) {
          filterParts.push(`(product_id='${params.filters.productId}')`);
        }
        filter = filterParts.join(' && ');
      }
      const url = `${CACTUS_API_BASE_URL}/api/collections/DomainNotes/records?filter=${encodeURIComponent(filter)}`;
      // console.debug('[FetchTasksTool] filter:', filter);
      // console.debug('[FetchTasksTool] request URL:', url);
      // Fetch tasks
      const response = await axios.get(
        url,
        {
          headers: {
            Authorization: token,
          },
        }
      );
      // Format the response
      const tasks = response.data.items.map((task: any) => ({
        id: task.id,
        title: task.title,
        body: task.body,
        productId: task.product_id,
        createdAt: task.created,
        updatedAt: task.updated,
        dueDate: task.due,
        dueEnabled: task.dueEnabled,
        assignedProfiles: task.assignment_profiles,
        assignedTeams: task.assignment_teams,
        pose: task.pose,
      }));
      return JSON.stringify({
        success: true,
        totalTasks: response.data.totalItems,
        tasks: tasks,
      }, null, 2);
    } catch (error) {
      console.error('[FetchTasksTool] Error:', error);
      if (error instanceof z.ZodError) {
        return `Invalid input: ${error.errors.map(e => e.message).join(', ')}`;
      }
      if (axios.isAxiosError(error)) {
        return `Error fetching tasks: ${error.response?.data?.message || error.message}`;
      }
      return `Unknown error: ${error}`;
    }
  }
}

// Create Task Tool
export class CreateTaskTool extends Tool {
  name = 'create_cactus_task';
  description = 'Create a new task in Cactus. Trigger only when user asks to create a cactus task.';

  async _call(input: any): Promise<string> {
    try {
      // Only log raw input for debugging
      // console.debug('[CreateTaskTool] raw input:', input);
      const cactusDomainUuid = CACTUS_DOMAIN_ID;
      if (!cactusDomainUuid) {
        throw new Error('CACTUS_DOMAIN_ID environment variable is not set.');
      }
      const token = await authenticate();
      const domainRecordId = await getDomainDatabaseRecordId(cactusDomainUuid, token);

      let params: any;
      if (input === undefined || input === null) {
        throw new Error('No input provided to CreateTaskTool.');
      } else if (typeof input === 'object') {
        if ('input' in input && typeof input.input === 'string') {
          params = { title: input.input };
        } else {
          params = { ...input };
        }
      } else if (typeof input === 'string') {
        try {
          params = CreateTaskInputSchema.parse(JSON.parse(input));
        } catch (e) {
          // Silent fallback: treat as title
          params = { title: input };
        }
      }
      
      const taskData: any = {
        title: params.title,
        domain: domainRecordId,
      };
      if (params.body) {
        taskData.body = params.body;
      }
      if (params.productId) {
        taskData.product_id = params.productId;
      }
      if (params.pose) {
        taskData.pose = JSON.stringify(params.pose);
      }
      if (params.dueDate) {
        taskData.due = params.dueDate;
        taskData.dueEnabled = params.dueEnabled !== false;
      }
      // Handle profile assignments
      if (params.assignToProfiles && params.assignToProfiles.length > 0) {
        const profileIds = await getProfileRecordIds(params.assignToProfiles, domainRecordId, token);
        if (profileIds.length > 0) {
          taskData.assignment_profiles = profileIds;
        }
      }
      // Handle team assignments
      if (params.assignToTeams && params.assignToTeams.length > 0) {
        const teamIds = await getTeamRecordIds(params.assignToTeams, domainRecordId, token);
        if (teamIds.length > 0) {
          taskData.assignment_teams = teamIds;
        }
      }
      // console.debug('[CreateTaskTool] Final taskData:', taskData);
      // Create the task
      const response = await axios.post(
        `${CACTUS_API_BASE_URL}/api/collections/DomainNotes/records`,
        taskData,
        {
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
        }
      );
      return JSON.stringify({
        success: true,
        message: 'Task created successfully',
        task: {
          id: response.data.id,
          title: response.data.title,
          body: response.data.body,
          productId: response.data.product_id,
          createdAt: response.data.created,
          assignedProfiles: response.data.assignment_profiles,
          assignedTeams: response.data.assignment_teams,
        },
      }, null, 2);
    } catch (error) {
      console.error('[CreateTaskTool] Error:', error);
      if (error instanceof z.ZodError) {
        return `Invalid input: ${error.errors.map(e => e.message).join(', ')}`;
      }
      if (axios.isAxiosError(error)) {
        return `Error creating task: ${error.response?.data?.message || error.message}`;
      }
      return `Unknown error: ${error}`;
    }
  }
} 