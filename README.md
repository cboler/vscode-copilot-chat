# Secure Copilot Fork (Local/Dev Exploration)

This repository is a local/dev-only exploratory fork of the open-source VS Code Copilot Chat extension codebase.

## Purpose

This fork exists to support:

- security review
- architecture mapping
- telemetry auditing
- configuration surface analysis
- transport and dependency abstraction research
- controlled local experimentation in authorized development environments

## Non-Goals

This repository is **not** intended for:

- production deployment
- unauthorized access to third-party services
- bypassing authentication, licensing, or service-side access controls
- evading telemetry or policy requirements outside approved development and test environments

## Scope of Investigation

Current work in this fork focuses on identifying and documenting:

- authentication entry points and session dependencies
- networking layers and HTTP client usage
- telemetry initialization and outbound reporting paths
- configuration points relevant to secure/local testing
- agent and terminal-execution permission boundaries

## Development Principles

Changes in this fork should aim to:

- preserve explicit user-consent flows
- keep terminal execution approval prompts intact
- make telemetry behavior visible, configurable, and testable
- isolate environment-specific configuration behind clear settings
- improve auditability of outbound network behavior
- document architectural assumptions before modifying behavior

## Expected Deliverables

Planned outputs include:

1. a codebase mapping report with file paths and line references
2. a telemetry and networking audit
3. configuration proposals for local/dev test scenarios
4. design notes for maintainers and reviewers

## Local/Dev-Only Warning

Do not treat this fork as a supported replacement for GitHub Copilot or any hosted production service.  
All experimentation should occur only in environments where you are authorized to inspect, modify, build, and run the software.

## Upstream

This repository is a fork of the open-source `microsoft/vscode-copilot-chat` project. See upstream documentation for original product behavior, licensing, and support expectations.

## License

See `LICENSE.txt`.
