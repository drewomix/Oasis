# Mira - Smart Glasses AI Assistant

Mira is an intelligent AI assistant designed specifically for smart glasses, built on the AugmentOS platform. It provides real-time voice interaction, visual processing, and contextual assistance through smart wearables.

## Overview

Mira serves as a virtual assistant that runs on smart glasses, enabling users to:
- Get answers to questions through voice commands
- Process visual information from the camera
- Receive location-aware responses
- Access phone notifications
- Interact with various third-party tools and applications

The system is built using TypeScript and Node.js, with a modular agent-based architecture that supports extensible functionality through custom tools and integrations.

## Key Features

### 🎤 Voice Interaction
- Wake word detection ("Hey Mira" and variants)
- Real-time speech transcription and processing
- Configurable response modes (audio or visual)
- Optional head-up activation mode for battery saving

### 📷 Visual Processing
- Camera integration for visual context
- Photo analysis capabilities
- Real-time image processing for query enhancement

### 🌍 Location Awareness
- GPS-based location services
- Timezone detection and handling
- Location-specific responses (weather, news, etc.)

### 📱 Notification Integration
- Phone notification display
- Contextual notification filtering
- Real-time notification processing

### 🔧 Extensible Tool System
- Modular agent architecture
- Custom tool development support
- Third-party API integrations
- Search engine capabilities

## Architecture

### Core Components

1. **MiraAgent** - Main AI processing agent
2. **TranscriptionManager** - Handles speech recognition and processing
3. **NotificationsManager** - Manages phone notifications
4. **Agent Tools** - Extensible toolkit for various functionalities

### Agent System

The system uses a flexible agent-based architecture where:
- Each agent implements the `AgentInterface`
- Agents can use various tools for different capabilities
- Tools can be dynamically loaded and configured
- Agents maintain conversation context and history

### Tool System

Built-in tools include:
- **SearchToolForAgents** - Web search capabilities
- **TpaCommandsTool** - Third-party app interactions
- **Calculator** - Mathematical computations

## Technology Stack

- **Runtime**: Node.js with Bun
- **Language**: TypeScript
- **Framework**: Express.js
- **AI/ML**: LangChain with multiple LLM providers
- **Platform**: AugmentOS SDK (@mentra/sdk)
- **Containerization**: Docker
- **Package Manager**: Bun

## Project Structure

```
src/
├── agents/           # AI agents and core logic
│   ├── tools/       # Agent tools and capabilities
│   ├── MiraAgent.ts # Main AI assistant agent
│   └── *.ts         # Other specialized agents
├── utils/           # Utility functions
│   ├── text-wrapping/  # Text processing utilities
│   └── *.ts         # Other utilities
├── public/          # Static assets (audio files, config)
└── index.ts         # Main application entry point
```

## Getting Started

See the [Setup Guide](./setup.md) for detailed installation and configuration instructions.

## Development

See the [Development Guide](./development.md) for information on contributing to the project.

## API Reference

See the [API Documentation](./api.md) for detailed information about the system's APIs and interfaces.

## License

This project is licensed under the terms specified in the LICENSE file.