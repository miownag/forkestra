# Custom Providers Implementation Plan

## Overview

Enable users to add and configure arbitrary CLI-based AI providers beyond the built-in Claude and Kimi adapters. This allows integration with any command-line tool that communicates via stdio.

## Goals

- Support dynamic provider registration (not just hardcoded Claude/Kimi)
- Allow users to configure custom CLI paths, arguments, and environment variables
- Provide flexible output parsing strategies
- Maintain backward compatibility with existing providers

## Key Components

### 1. Data Model Refactoring

- Introduce a `GenericProviderConfig` structure to capture:
  - Provider name and identifier
  - CLI executable path
  - Startup arguments
  - Environment variables
  - Output parsing mode (line-based vs interactive)
  - Prompt patterns for interactive mode
- Extend `ProviderType` to support dynamic/custom variants
- Update `ProviderSettings` to use the generic config

### 2. Generic Provider Adapter

- Create a `GenericProviderAdapter` that replaces provider-specific adapters
- Implement configurable output reading strategies:
  - Line-based: Read line by line (suitable for JSON/streaming output)
  - Interactive: Byte-by-byte reading with prompt pattern detection
- Support configurable message formatting and parsing

### 3. Configuration UI

- Add a Button `Add Custom Provider` to the AI Providers section of `settings` route. Click to open a dialog of form for provider configuration. And after configure the provider, add it to the list of providers
- Allow editing of all configuration parameters
- Provide testing/validation of provider configuration
- Support import/export of provider configurations

### 4. Detection Logic

- Update provider detection to work with custom paths
- Support version checking for custom providers
- Allow users to manually specify provider metadata if auto-detection fails

### 5. Migration Strategy

- Migrate existing Claude/Kimi configurations to new generic format
- Ensure existing sessions continue to work post-migration
- Deprecate provider-specific adapters gradually

## Implementation Phases

### Phase 1: Foundation

- Define generic configuration models
- Create generic adapter with configurable strategies
- Maintain backward compatibility layer

### Phase 2: UI Updates

- Update settings UI to support custom provider creation
- Add configuration forms for all parameters
- Implement provider testing functionality

### Phase 3: Migration & Cleanup

- Migrate existing providers to generic format
- Remove hardcoded provider-specific logic
- Update documentation

## Considerations

- Security: Validate CLI paths and restrict dangerous configurations
- UX: Provide templates for common providers (aider, codellama, etc.)
- Extensibility: Design for future protocol adapters (not just stdio)
- Error Handling: Graceful degradation when custom providers fail
