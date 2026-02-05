# Forkestra

> Forkestra = fork + orchestra

Seamlessly create distinct Git worktrees that let coding agents work in parallel, with built-in isolation to prevent any code conflicts.

Leveraging **multithreading and concurrent programming** is the key to supercharge your development efficiency!

## Quick Start

Check this [Documentation](https://forkestra.readthedocs.io/en/latest/) to download and get started.

## Features

1. **Multithreading and concurrent programming**
   Using Git worktrees, Forkestra allows you to create multiple isolated environments for your agents to work in parallel.

2. **Support multiple providers**
   Support Claude Code and Kimi Code currently. And it's easy to add more with the ability of `Provider`.

3. **Support custom path**
   You can specify the path of the CLI to handle some special scene.

4. **Friendly interface**
   Get rid of the complexity of the Terminal.

## Contributing

Welcome contributions from the community! Whether you’re fixing a bug, adding a feature, or improving documentation, follow these steps to contribute:

1. Fork the repository – Fork Forkestra

2. Clone your forked repository and create a new branch:

   ```bash
   git clone https://github.com/your-username/forkestra.git
   git checkout -b feature/your-feature-name
   ```

3. Run this project in your local environment:

   ```bash
   bun install
   bun tauri dev
   ```

4. Make your changes and commit them with a clear commit message:

5. Push your branch and create a pull request.

Please ensure your code follows the project’s coding standards and includes tests for any new features or bug fixes.
