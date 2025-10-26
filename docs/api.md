# Mira API Documentation

This document provides detailed information about Mira's APIs, interfaces, and integration points.

## Table of Contents

- [Agent Interface](#agent-interface)
- [Core APIs](#core-apis)
- [Tool System](#tool-system)
- [SDK Integration](#sdk-integration)
- [External APIs](#external-apis)
- [Event System](#event-system)

## Agent Interface

All agents in Mira must implement the `AgentInterface`:

```typescript
export interface Agent {
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentPrompt: string;
  agentTools: any[];

  handleContext(inputData: any): Promise<{
    [key: string]: any;
  }>;
}
```

### Properties

- **agentId**: Unique identifier for the agent
- **agentName**: Human-readable name for the agent
- **agentDescription**: Brief description of agent capabilities
- **agentPrompt**: System prompt template for the agent
- **agentTools**: Array of tools available to the agent

### Methods

- **handleContext(inputData)**: Main method for processing user input and context

## Core APIs

### MiraAgent

The main AI agent class that handles user queries and context.

#### Constructor

```typescript
constructor(cloudUrl: string, userId: string)
```

#### Methods

##### updateLocationContext(locationInfo)

Updates the agent's location context for location-aware responses.

```typescript
updateLocationContext(locationInfo: {
  city: string;
  state: string;
  country: string;
  timezone: {
    name: string;
    shortName: string;
    fullName: string;
    offsetSec: number;
    isDst: boolean;
  };
}): void
```

##### handleContext(userContext)

Processes user queries with full context including location, notifications, and photos.

```typescript
handleContext(userContext: {
  query: string;
  photo?: PhotoData;
  notifications?: any[];
  transcript_history?: string;
  insight_history?: string;
}): Promise<string | typeof GIVE_APP_CONTROL_OF_TOOL_RESPONSE>
```

### TranscriptionManager

Manages speech recognition and processing for user interactions.

#### Constructor

```typescript
constructor(
  session: AppSession, 
  sessionId: string, 
  userId: string, 
  miraAgent: MiraAgent, 
  serverUrl: string
)
```

#### Methods

##### handleTranscription(transcriptionData)

Processes incoming speech transcription data.

```typescript
handleTranscription(transcriptionData: {
  text: string;
  isFinal: boolean;
  notifications?: any[];
}): void
```

##### handleHeadPosition(headPositionData)

Handles head position updates for optional head-up wake mode.

```typescript
handleHeadPosition(headPositionData: string | { position: string }): void
```

##### handleLocation(locationData)

Processes location updates and performs reverse geocoding.

```typescript
handleLocation(locationData: { lat: number; lng: number }): Promise<void>
```

### NotificationsManager

Manages phone notifications for users.

#### Methods

##### addNotifications(userId, notifications)

Adds new notifications for a user.

```typescript
addNotifications(userId: string, notifications: any[]): void
```

##### getLatestNotifications(userId, count)

Retrieves the latest notifications for a user.

```typescript
getLatestNotifications(userId: string, count: number = 5): any[]
```

##### clearNotifications(userId)

Clears all notifications for a user.

```typescript
clearNotifications(userId: string): void
```

## Tool System

### StructuredTool Base Class

All tools extend from LangChain's `StructuredTool` class and must implement:

```typescript
abstract class StructuredTool {
  name: string;
  description: string;
  schema: z.ZodSchema;
  
  abstract _call(input: any): Promise<string>;
}
```

### Built-in Tools

#### SearchToolForAgents

Web search capabilities using Jina AI.

**Input Schema:**
```typescript
{
  searchKeyword: string;
  location?: string; // Optional location context
}
```

**Usage:**
```typescript
const searchTool = new SearchToolForAgents();
const result = await searchTool._call({
  searchKeyword: "weather today",
  location: "San Francisco, CA"
});
```

#### TpaListAppsTool

Lists available third-party applications.

**Input Schema:**
```typescript
{
  includeRunning?: boolean; // Whether to include running status
}
```

**Usage:**
```typescript
const listTool = new TpaListAppsTool(cloudUrl, userId);
const apps = await listTool._call({ includeRunning: true });
```

#### TpaCommandsTool

Controls third-party applications (start/stop).

**Input Schema:**
```typescript
{
  action: 'start' | 'stop';
  packageName: string; // Exact package name of the app
}
```

**Usage:**
```typescript
const commandTool = new TpaCommandsTool(cloudUrl, userId);
const result = await commandTool._call({
  action: 'start',
  packageName: 'com.example.app'
});
```

#### Calculator

Mathematical computation tool from LangChain community.

**Input Schema:**
```typescript
{
  input: string; // Mathematical expression to evaluate
}
```

### Creating Custom Tools

To create a custom tool:

1. Extend `StructuredTool`
2. Define input schema using Zod
3. Implement the `_call` method
4. Add to agent's tool list

Example:

```typescript
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const CustomInputSchema = z.object({
  input: z.string().describe('Input parameter description'),
});

export class CustomTool extends StructuredTool {
  name = 'Custom_Tool';
  description = 'Description of what this tool does';
  schema = CustomInputSchema;

  async _call(input: { input: string }): Promise<string> {
    // Tool implementation
    return `Processed: ${input.input}`;
  }
}
```

## SDK Integration

### AugmentOS SDK (@mentra/sdk)

Mira integrates with the AugmentOS SDK for smart glasses functionality.

#### Key SDK Components

- **AppServer**: Base server class for TPA applications
- **AppSession**: Individual user session management
- **PhotoData**: Camera photo data structure
- **logger**: Logging utilities

#### Session Events

```typescript
// Transcription events
session.events.onTranscription((data) => {
  // Handle speech recognition data
});

// Head position events
session.events.onHeadPosition((data) => {
  // Handle head movement data
});

// Phone notification events
session.events.onPhoneNotifications((notifications) => {
  // Handle incoming phone notifications
});

// Location events
session.events.onLocation((locationData) => {
  // Handle GPS location updates
});
```

#### Session Capabilities

```typescript
// Display capabilities
session.layouts.showTextWall(text, options);
session.layouts.showReferenceCard(title, content, options);

// Audio capabilities
session.audio.speak(text);
session.audio.playAudio({ audioUrl });

// Camera capabilities
session.camera.requestPhoto({ size: "small" | "medium" | "large" });

// Location capabilities
session.location.getLatestLocation({ accuracy: "high" | "medium" | "low" });
```

## External APIs

### LocationIQ API

Used for reverse geocoding and timezone information.

**Base URL:** `https://us1.locationiq.com/v1/`

**Endpoints:**
- `GET /reverse.php` - Reverse geocoding
- `GET /timezone` - Timezone information

**Authentication:** API key via `key` parameter

### Jina AI Search API

Used for web search functionality.

**Base URL:** `https://s.jina.ai/`

**Authentication:** Bearer token in Authorization header

**Headers:**
```typescript
{
  'Authorization': `Bearer ${JINA_API_KEY}`,
  'X-Engine': 'direct',
  'X-Retain-Images': 'none',
  'X-Timeout': '5'
}
```

## Event System

### Wake Word Detection

Mira supports numerous wake word variations:

```typescript
const explicitWakeWords = [
  "hey mira", "he mira", "hey mirror", "he mirror",
  "amira", "hey amira", "hey myra", "he myra",
  // ... and many more variations
];
```

### Transcription Flow

1. **Wake Word Detection**: System listens for wake words
2. **Speech Capture**: Records user speech after wake word
3. **Transcription Processing**: Converts speech to text
4. **Context Assembly**: Gathers location, notifications, photos
5. **Agent Processing**: Sends to MiraAgent for response
6. **Response Delivery**: Shows/speaks response to user

### Head Position Integration

Optional battery-saving mode that only activates on head position change:

```typescript
// Enable head-up activation mode
session.settings.set('wake_requires_head_up', true);

// Activation window: 10 seconds after head moves from 'down' to 'up'
const ACTIVATION_WINDOW_MS = 10_000;
```

## Error Handling

### Common Error Patterns

```typescript
// API errors
try {
  const result = await apiCall();
} catch (error) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.message;
    return `API Error: ${message}`;
  }
  return `Unknown error: ${error}`;
}

// Tool errors
try {
  const result = await tool._call(input);
} catch (error) {
  console.error(`Tool ${tool.name} error:`, error);
  return `Tool execution failed: ${error.message}`;
}
```

### Response Formats

Successful responses should include the "Final Answer:" marker:

```typescript
return "Final Answer: Your response here";
```

Special responses:
- `GIVE_APP_CONTROL_OF_TOOL_RESPONSE`: Transfers control to tool
- `"No query provided."`: Empty or invalid query
- `"Error processing query."`: General error fallback

## Performance Considerations

### Battery Optimization

- Use head-up activation mode to reduce transcription processing
- Implement timeout mechanisms for long-running operations
- Cache frequently accessed data (location, app lists)

### Memory Management

- Clear conversation history periodically
- Limit photo retention (30-second timeout)
- Remove old notifications automatically

### Rate Limiting

- Implement delays between API calls
- Use timeouts for external service requests
- Batch operations when possible