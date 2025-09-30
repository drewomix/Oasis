# Mira Development Guide

This guide covers development practices, architecture patterns, and contribution guidelines for the Mira project.

## Table of Contents

- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Code Style Guidelines](#code-style-guidelines)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Debugging](#debugging)
- [Performance Optimization](#performance-optimization)
- [Contributing](#contributing)

## Development Workflow

### Getting Started

1. **Set up the development environment** (see [Setup Guide](./setup.md))
2. **Create a feature branch** from `main`
3. **Make your changes** following the code style guidelines
4. **Test your changes** thoroughly
5. **Submit a pull request** with a clear description

### Branch Naming

Use descriptive branch names:
- `feature/add-weather-tool`
- `fix/transcription-timeout`
- `refactor/agent-architecture`
- `docs/update-api-guide`

### Development Commands

```bash
# Development with hot reload
bun run dev

# Docker development environment
bun run docker:dev

# Run tests
bun run test

# Lint code
bun run lint

# Build for production
bun run build
```

## Architecture Overview

### Core Architecture

```
┌─────────────────────────────────────────────┐
│                 Smart Glasses               │
│              (AugmentOS Device)             │
└─────────────┬───────────────────────────────┘
              │ WebSocket/HTTP
┌─────────────▼───────────────────────────────┐
│            MiraServer                       │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ TranscriptionMgr│  │ NotificationsMgr│   │
│  └─────────────────┘  └─────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │           MiraAgent                 │   │
│  │  ┌───────────┐ ┌──────────────┐     │   │
│  │  │ LLM Chain │ │ Tool System  │     │   │
│  │  └───────────┘ └──────────────┘     │   │
│  └─────────────────────────────────────┘   │
└─────────────┬───────────────────────────────┘
              │ HTTP/API Calls
┌─────────────▼───────────────────────────────┐
│           External APIs                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────────┐   │
│  │ Jina AI │ │LocationQ│ │ AugmentOS   │   │
│  └─────────┘ └─────────┘ └─────────────┘   │
└─────────────────────────────────────────────┘
```

### Component Relationships

1. **MiraServer**: Main application server, handles sessions
2. **TranscriptionManager**: Processes speech and manages conversation flow
3. **MiraAgent**: Core AI agent using LangChain for LLM interactions
4. **Tool System**: Extensible tools for various capabilities
5. **NotificationsManager**: Handles phone notification management

### Data Flow

1. **Input**: User speaks wake word + query
2. **Transcription**: Speech converted to text
3. **Context**: Location, notifications, photos gathered
4. **Processing**: MiraAgent processes with LLM and tools
5. **Response**: Text/audio response delivered to user

## Code Style Guidelines

### TypeScript Standards

- **Strict typing**: Use explicit types, avoid `any`
- **Interface definitions**: Define clear interfaces for data structures
- **Error handling**: Use try/catch blocks for async operations
- **Null safety**: Handle undefined/null values explicitly

### Formatting Rules

- **Indentation**: 2 spaces (no tabs)
- **Line length**: 100 characters maximum
- **Trailing commas**: Required in multiline structures
- **Semicolons**: Required

### Naming Conventions

```typescript
// Variables and functions: camelCase
const userName = 'mira';
function processQuery() {}

// Classes and interfaces: PascalCase
class MiraAgent {}
interface AgentInterface {}

// Constants: UPPER_CASE
const WAKE_WORDS = ['hey mira'];

// Files: camelCase or kebab-case
// miraAgent.ts or mira-agent.ts
```

### Import Organization

```typescript
// 1. External libraries
import express from 'express';
import { z } from 'zod';

// 2. Internal modules
import { MiraAgent } from './agents';
import { wrapText } from './utils';

// 3. Types (last)
import type { Agent } from './AgentInterface';
```

### Documentation

Use JSDoc comments for public APIs:

```typescript
/**
 * Processes user queries with context
 * @param userContext - Context including query, location, notifications
 * @returns Promise resolving to agent response
 */
async handleContext(userContext: Record<string, any>): Promise<string> {
  // Implementation
}
```

## Adding New Features

### Creating a New Agent

1. **Define the interface**:

```typescript
import { Agent } from './AgentInterface';

export class CustomAgent implements Agent {
  public agentId = 'custom_agent';
  public agentName = 'CustomAgent';
  public agentDescription = 'Description of agent functionality';
  public agentPrompt = 'System prompt for the agent';
  public agentTools = []; // Tools available to this agent

  async handleContext(inputData: any): Promise<any> {
    // Agent implementation
  }
}
```

2. **Register with the system**:

```typescript
// In index.ts or appropriate initialization file
import { CustomAgent } from './agents/CustomAgent';

const customAgent = new CustomAgent();
// Add to agent registry or use in session
```

### Creating a New Tool

1. **Define the tool class**:

```typescript
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const CustomToolInputSchema = z.object({
  parameter: z.string().describe('Parameter description'),
});

export class CustomTool extends StructuredTool {
  name = 'Custom_Tool';
  description = 'What this tool does and when to use it';
  schema = CustomToolInputSchema;

  async _call(input: { parameter: string }): Promise<string> {
    try {
      // Tool implementation
      const result = await processInput(input.parameter);
      return `Result: ${result}`;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }
}
```

2. **Add to agent tools**:

```typescript
// In MiraAgent constructor or similar
this.agentTools = [
  new SearchToolForAgents(),
  new CustomTool(), // Add your new tool
  // ... other tools
];
```

### Adding New API Endpoints

1. **Define routes** (if adding REST endpoints):

```typescript
// In a new routes file
import express from 'express';

const router = express.Router();

router.get('/custom-endpoint', async (req, res) => {
  try {
    const result = await customOperation(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

2. **Register with server**:

```typescript
// In main server file
import customRoutes from './routes/custom';
app.use('/api/custom', customRoutes);
```

### Adding New Wake Words

Edit the `explicitWakeWords` array in `src/index.ts`:

```typescript
const explicitWakeWords = [
  "hey mira", "he mira",
  // Add new variations
  "hey assistant", "he assistant",
  // ... existing wake words
];
```

## Testing

### Test Structure

```
tests/
├── unit/          # Unit tests for individual components
├── integration/   # Integration tests for component interaction
└── e2e/          # End-to-end tests for full workflows
```

### Writing Tests

```typescript
// Example unit test
import { describe, it, expect } from 'bun:test';
import { MiraAgent } from '../src/agents/MiraAgent';

describe('MiraAgent', () => {
  it('should process simple queries', async () => {
    const agent = new MiraAgent('http://test', 'user123');
    const result = await agent.handleContext({ query: 'hello' });
    expect(typeof result).toBe('string');
  });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/agents.test.ts

# Run tests with coverage
bun test --coverage
```

### Testing Tools

Test individual tools:

```typescript
import { SearchToolForAgents } from '../src/agents/tools/SearchToolForAgents';

const tool = new SearchToolForAgents();
const result = await tool._call({ searchKeyword: 'test query' });
console.log(result);
```

## Debugging

### Local Debugging

1. **Console logging**:

```typescript
console.log('[Component] Debug info:', data);
console.error('[Component] Error:', error);
```

2. **Debug environment variables**:

```bash
DEBUG=mira:* bun run dev
```

### Docker Debugging

1. **View logs**:

```bash
bun run logs
```

2. **Access container shell**:

```bash
bun run sh
```

3. **Attach debugger**:

```typescript
// Add in code where you want to debug
debugger; // Node.js will pause here if debugger attached
```

### Common Debugging Scenarios

**Transcription Issues**:
- Check wake word detection logic
- Verify transcription API responses
- Test timeout handling

**Agent Response Issues**:
- Review LLM prompts and responses
- Check tool execution logs
- Verify context assembly

**Tool Failures**:
- Validate input schemas
- Check API credentials
- Test error handling paths

## Performance Optimization

### Memory Management

```typescript
// Clear large objects when done
this.messages = [];
this.activePhotos.clear();

// Use WeakMap for temporary data
const temporaryData = new WeakMap();
```

### Async Operations

```typescript
// Use Promise.all for parallel operations
const [location, notifications, apps] = await Promise.all([
  getLocation(),
  getNotifications(),
  getApps()
]);

// Implement timeouts for external calls
const result = await Promise.race([
  apiCall(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 5000)
  )
]);
```

### Battery Optimization

- Use head-up activation mode when possible
- Implement smart transcription subscription
- Cache frequently accessed data
- Minimize camera usage

### LLM Optimization

- Use concise prompts
- Limit conversation history length
- Cache common responses
- Use appropriate model sizes

## Contributing

### Pull Request Process

1. **Fork the repository** and create a feature branch
2. **Make your changes** following the guidelines
3. **Add tests** for new functionality
4. **Update documentation** if needed
5. **Run the test suite** and ensure all tests pass
6. **Run linting** and fix any issues
7. **Submit a pull request** with:
   - Clear description of changes
   - Screenshots/videos for UI changes
   - Links to related issues

### Code Review Guidelines

**For Authors**:
- Keep PRs focused and reasonably sized
- Write clear commit messages
- Respond promptly to review feedback
- Update PRs based on feedback

**For Reviewers**:
- Review code logic and architecture
- Check for security issues
- Verify test coverage
- Ensure documentation is updated

### Issue Reporting

When reporting bugs:
- Provide clear reproduction steps
- Include relevant logs and error messages
- Specify environment details (OS, Node version, etc.)
- Attach screenshots if applicable

### Feature Requests

When requesting features:
- Explain the use case and motivation
- Provide examples of desired behavior
- Consider implementation complexity
- Discuss with maintainers before large changes

## Best Practices

### Error Handling

```typescript
// Always handle async errors
try {
  const result = await asyncOperation();
  return result;
} catch (error) {
  logger.error('Operation failed:', error);
  return fallbackValue;
}

// Provide meaningful error messages
throw new Error(`Failed to process query: ${error.message}`);
```

### Logging

```typescript
// Use structured logging
logger.info('Processing query', { 
  userId, 
  queryLength: query.length,
  sessionId 
});

// Log errors with context
logger.error(error, 'Failed to update location context', {
  userId,
  locationData
});
```

### Configuration

```typescript
// Use environment variables for configuration
const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
  apiKey: process.env.AUGMENTOS_API_KEY,
  enableFeature: process.env.ENABLE_FEATURE === 'true'
};
```

### Security

- Never log sensitive information
- Validate all inputs
- Use HTTPS for external API calls
- Keep dependencies updated

This development guide should help you understand the codebase structure and contribute effectively to the Mira project.