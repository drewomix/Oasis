# Mira Development Guide

## Build & Run Commands
- `bun run dev`: Run development server with hot reloading
- `bun run docker:dev`: Start development environment in Docker
- `bun run build`: Build the application
- `bun run start`: Run the application

## Test Commands
- `bun run test`: Run all tests
- `bun test <path-to-test-file>`: Run a single test file

## Lint Commands
- `bun run lint`: Run ESLint on TypeScript files

## Code Style Guidelines
- **TypeScript**: Use strict typing for all new code
- **Formatting**: 2 spaces for indentation, trailing commas
- **Imports**: Group imports by: external libraries, internal modules, types
- **Naming**:
  - camelCase for variables/functions
  - PascalCase for classes/interfaces/types
  - UPPER_CASE for constants
- **Error Handling**: Use try/catch blocks for async operations
- **Components**: Follow existing patterns in similar files
- **Agents**: New agents should implement AgentInterface

## Docker Development
Most commands run in Docker by default. Use `docker:dev` to start the environment and `docker:stop` to shut it down.