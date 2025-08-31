# Copilot Instructions for ioBroker/adapter-dev

## Project Overview

This repository provides a comprehensive development toolkit for ioBroker adapter developers. It contains CLI tools and utilities that streamline the development, building, and translation management of ioBroker adapters.

### Core Purpose
- **Translation Management**: Tools to convert between different i18n formats and automatically translate content
- **Build System**: Unified build tools for TypeScript and React components in ioBroker adapters  
- **Development Utilities**: Directory cleaning and other helper tools

### Key CLI Tools
- `translate-adapter`: Manages translations between JSON and JS formats, handles automatic translation
- `build-adapter`: Compiles TypeScript and React sources with optimized esbuild configuration
- `clean-dir`: Utility for cleaning build directories

## Architecture & Code Patterns

### Project Structure
```
src/
├── translate-adapter.ts          # Main CLI for translation management
├── translate-adapter-handlers.ts # Implementation logic for translation commands
├── build-adapter.ts             # Main CLI for build operations  
├── build-adapter-handlers.ts    # Implementation logic for build commands
├── util.ts                      # Shared utilities and error handling
├── network.ts                   # Network utilities for translation APIs
└── index.ts                     # Public API exports
```

### CLI Pattern
All CLI tools follow a consistent pattern using **yargs**:

1. **Main CLI file** (`*-adapter.ts`): Defines commands, options, and argument parsing
2. **Handler file** (`*-handlers.ts`): Contains the implementation logic
3. **Error handling**: Uses `interceptErrors()` wrapper for consistent error reporting
4. **Environment variable support**: All CLIs support env var configuration

### TypeScript Conventions

#### Code Style
- **Tabs for indentation** (4 spaces width)
- **Semicolons required**
- **Double quotes for strings**
- **Trailing commas in objects/arrays**
- **Line width: 80 characters**

#### Type Safety
- Explicit return types on functions (warn level)
- `@typescript-eslint/no-explicit-any` is disabled for flexibility
- Function expressions and typed functions allowed without explicit return types
- Parameters starting with `_` are ignored in unused variable checks

#### Import/Export Patterns
- Use ES6 imports/exports consistently
- Prefer named exports over default exports
- Group imports: external libraries, then local modules
- Re-export public APIs through `index.ts`

### Error Handling
Use the `interceptErrors()` wrapper for all command handlers:

```typescript
import { interceptErrors } from "./util";

.command(
    ["translate", "t"],
    "Description",
    {},
    interceptErrors(handleTranslateCommand),
)
```

The `die()` function provides consistent error reporting and process termination.

## Translation Management

### Key Concepts
- **i18n Base Files**: English JSON files that serve as translation sources
- **words.js**: Legacy format still supported for compatibility
- **Multi-language Support**: Automatic translation to all ioBroker supported languages
- **Google Translate Integration**: Optional API support for better translations

### Translation Workflow
1. **Add text to English JSON files only**
2. **Run translation command** to generate other languages
3. **Convert between formats** when migrating from legacy words.js

### Command Patterns
```bash
npm run translate              # Translate all files
npm run translate to-json      # Convert words.js to JSON
npm run translate to-words     # Convert JSON to words.js  
npm run translate all          # Full sequence: translate → to-words → to-json
```

## Build System

### Supported Build Targets
- **TypeScript**: Compilation for Node.js adapters
- **React**: Browser bundles for admin UIs
- **Combined**: Both TypeScript and React in one command

### Build Configuration
- Uses **esbuild** for fast compilation
- Supports **watch mode** for development
- **Bundle splitting** for optimized React builds
- **Source maps** enabled for debugging

### Build Patterns
```bash
npm run build-adapter typescript    # Compile TS only
npm run build-adapter react        # Compile React only  
npm run build-adapter all          # Compile everything
```

## Testing Patterns

### Test Structure
- **Unit tests**: `*.test.ts` files alongside source
- **Integration tests**: `test/` directory for end-to-end scenarios
- **Test framework**: Mocha with Chai assertions
- **TypeScript**: Tests written in TypeScript, compiled with ts-node

### Test Conventions
- Use descriptive `describe()` and `it()` blocks
- Prefer `chai.expect()` assertions over other styles
- Test both success and error cases
- Mock external dependencies when needed

### Running Tests
```bash
npm test                    # Run all tests
npm run test:ts            # Unit tests only
npm run test:integration   # Integration tests only
```

## Development Workflow

### Setup
```bash
npm install                 # Install dependencies
npm run build              # Compile TypeScript
npm test                   # Verify everything works
```

### Development Commands
```bash
npm run watch              # Watch mode compilation
npm run lint               # ESLint check
npm run check              # TypeScript type check without emit
```

### Code Quality
- **ESLint**: Enforces code style and catches errors
- **Prettier**: Auto-formatting (integrated with ESLint)
- **TypeScript**: Strict type checking enabled
- **Pre-commit**: Run `npm run lint` before committing

## Domain-Specific Knowledge

### ioBroker Ecosystem
- **Adapters**: Plugins that extend ioBroker functionality
- **Admin UI**: Web interface for adapter configuration
- **io-package.json**: Adapter metadata and configuration
- **Language Support**: 20+ languages supported by ioBroker

### Translation Keys
- Use descriptive, hierarchical keys: `"settings.connection.timeout"`
- Avoid dynamic key generation
- Keep English text clear and concise
- Use placeholders for dynamic content: `"Connected to %s"`

### File Conventions
- **admin/i18n/**: Directory for translation files
- **build/**: Compiled output (git-ignored)
- **src/**: TypeScript source files
- **.buildconfig.json**: Optional build configuration overrides

## Contributing Guidelines

### Adding New Features
1. **Follow existing patterns**: Use yargs for CLI, handlers for logic
2. **Add tests**: Both unit and integration tests when appropriate
3. **Update documentation**: README.md and inline comments
4. **Type safety**: Maintain strict TypeScript compliance

### Debugging
- Use `npm run debug` for interactive debugging
- Enable source maps for stack traces
- Console output uses `ansi-colors` for better visibility

### Performance Considerations
- **esbuild**: Chosen for fast compilation
- **Parallel processing**: Translation APIs called concurrently when possible
- **Caching**: File system operations minimized
- **Memory**: Avoid loading large files unnecessarily

### Breaking Changes
This is a tool used by many adapter developers. Consider backwards compatibility:
- Maintain CLI argument compatibility
- Support legacy file formats during transition
- Provide migration guides for major changes
- Use semantic versioning appropriately