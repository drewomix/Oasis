# Mira Setup Guide

This guide will help you set up and configure Mira for development and production environments.

## Prerequisites

### Required Software
- **Bun**: JavaScript runtime and package manager (recommended)
- **Node.js**: Version 18+ (alternative to Bun)
- **Docker**: For containerized development
- **Git**: For version control

### Required API Keys
- **AUGMENTOS_API_KEY**: Your AugmentOS API key
- **LOCATIONIQ_TOKEN**: LocationIQ API key for location services (optional)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Mentra-Community/Mira.git
cd Mira
```

### 2. Install Dependencies

Using Bun (recommended):
```bash
bun install
```

Using npm:
```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Required
AUGMENTOS_API_KEY=your_augmentos_api_key_here
PACKAGE_NAME=@augmentos/mira

# Optional
PORT=80
LOCATIONIQ_TOKEN=your_locationiq_token_here
```

### 4. Configuration Files

The application uses configuration files located in `src/public/`:
- `tpa_config.json`: TPA (Third-Party App) configuration
- Audio files: `start.mp3`, `popping.mp3` for sound effects

## Development Setup

### Option 1: Local Development

Run the development server with hot reloading:

```bash
bun run dev
```

The server will start on port 80 (or the port specified in your `.env` file).

### Option 2: Docker Development (Recommended)

Start the development environment in Docker:

```bash
bun run docker:dev
```

This will:
- Build the development Docker container
- Start the application with hot reloading
- Mount your local code for real-time changes

To run in detached mode:
```bash
bun run docker:dev:detach
```

To stop the development environment:
```bash
bun run docker:stop
```

### Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run docker:dev` | Start Docker development environment |
| `bun run docker:stop` | Stop Docker development environment |
| `bun run build` | Build the application |
| `bun run test` | Run tests |
| `bun run lint` | Run ESLint |
| `bun run logs` | View Docker logs |
| `bun run restart` | Restart Docker container |
| `bun run sh` | Access Docker container shell |

## Production Deployment

### Build Production Image

```bash
# Build Docker image
bun run image:build

# Or build for GitHub Container Registry
bun run ghcr:build
```

### Deploy Production

```bash
# Run production environment
bun run prod

# Or run in detached mode
bun run prod:detach
```

### Stop Production

```bash
bun run prod:stop
```

## Configuration Options

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AUGMENTOS_API_KEY` | Yes | AugmentOS API key | - |
| `PACKAGE_NAME` | Yes | Application package name | @augmentos/mira |
| `PORT` | No | Server port | 80 |
| `LOCATIONIQ_TOKEN` | No | LocationIQ API key for location services | - |

### Wake Word Configuration

Mira supports multiple wake word variations. The default wake words include:
- "hey mira", "he mira"
- "hey mirror", "he mirror"
- "amira", "hey amira"
- And many other variations

Wake words are configured in `src/index.ts` in the `explicitWakeWords` array.

### Audio Configuration

Audio URLs for sound effects:
- **Processing Sound**: `https://mira.augmentos.cloud/popping.mp3`
- **Start Listening**: `https://mira.augmentos.cloud/start.mp3`

These can be customized by modifying the constants in `src/index.ts`.

## Troubleshooting

### Common Issues

1. **"AUGMENTOS_API_KEY is not set" Error**
   - Ensure you have created a `.env` file with the correct API key
   - Verify the API key is valid and active

2. **Port Already in Use**
   - Change the `PORT` variable in your `.env` file
   - Kill any processes using the default port

3. **Docker Issues**
   - Ensure Docker is running
   - Try rebuilding the Docker image: `bun run docker:build`
   - Check Docker logs: `bun run logs`

4. **Location Services Not Working**
   - Add a valid `LOCATIONIQ_TOKEN` to your `.env` file
   - The application will work without location services but with reduced functionality

### Debugging

Enable debug logging by:
1. Checking Docker logs: `bun run logs`
2. Accessing the container shell: `bun run sh`
3. Running tests to verify functionality: `bun run test`

## Next Steps

After setup:
1. Test the application with voice commands
2. Configure additional tools and integrations
3. Customize the AI agent behavior
4. See the [Development Guide](./development.md) for extending functionality

## Support

For issues and support:
1. Check the troubleshooting section above
2. Review the logs for error messages
3. Consult the [API Documentation](./api.md) for integration details
4. Report issues on the project repository