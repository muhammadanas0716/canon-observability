# Contributing to Canon

Thank you for your interest in contributing to Canon! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/canon.git
   cd canon
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build the project:
   ```bash
   pnpm build
   ```

## Development Workflow

### Running Tests

```bash
pnpm test
```

Run tests in watch mode:
```bash
pnpm test:watch
```

### Type Checking

```bash
pnpm typecheck
```

### Building

```bash
pnpm build
```

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   or
   ```bash
   git checkout -b fix/your-bug-fix
   ```

2. Make your changes following the project's code style:
   - Use TypeScript strict mode
   - Keep code minimal and avoid verbosity
   - No comments in functions
   - Follow existing patterns

3. Add tests for your changes in the `test/` directory

4. Ensure all tests pass:
   ```bash
   pnpm test
   ```

5. Ensure type checking passes:
   ```bash
   pnpm typecheck
   ```

6. Build the project to ensure it compiles:
   ```bash
   pnpm build
   ```

## Commit Messages

Write clear, descriptive commit messages:
- Use present tense ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issues/PRs when applicable

## Pull Request Process

1. Update the README.md if needed
2. Update documentation in `docs/` if your change affects functionality
3. Ensure your code follows the project's style guidelines
4. Make sure all tests pass
5. Submit a pull request with a clear description of your changes

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated (if needed)
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] Code follows project style

## Code Style

- TypeScript strict mode
- Minimal, non-verbose code
- No function comments
- Use meaningful variable names
- Follow existing code patterns

## Reporting Issues

When reporting bugs, please include:
- Node.js version
- Canon version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Relevant code snippets

## Feature Requests

Feature requests are welcome! Please:
- Check if the feature already exists
- Explain the use case
- Describe the expected behavior
- Consider backwards compatibility

## Questions?

Feel free to open an issue for questions or discussions.

Thank you for contributing!

