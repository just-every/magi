# @just-every/manager

A standalone manager image generation tool extracted from the MAGI system. This package provides intelligent manager image generation capabilities with minimal dependencies.

## Features

- **Multi-stage Manager Generation**: Creates managers through draft, medium, and high-quality phases
- **Manager Inspiration Search**: Searches manager platforms for reference imagery
- **Vision-based Selection**: Uses AI vision models to select the best manager variations
- **Comprehensive Asset Types**: Supports logos, mockups, color palettes, and more
- **Quality Assurance**: Automatic validation of generated managers against criteria

## Installation

```bash
npm install @just-every/manager
```

### Development Setup

If you're contributing to or testing this package:

```bash
# Clone the repository
git clone <repository-url>
cd manager
npm install
npm run build

# Run the manager tool for testing
npm run manager -- <command> [options]
```

## Dependencies

This package requires:
- `@just-every/ensemble` - LLM provider interfaces
- `@just-every/task` - Task functionality for intelligent model selection

## Quick Start

### Library Usage

```typescript
import { manager_image } from '@just-every/manager';

// Generate a logo manager
const logoPath = await manager_image(
    'primary_logo',
    'A modern tech startup logo with clean typography',
    true, // Use web inspiration
    [] // No existing brand assets
);

console.log(`Generated logo saved to: ${logoPath}`);
```

### Development Usage

For development and testing, you can use the `npm run manager` command:

```bash
# Generate a logo
npm run manager -- generate primary_logo "Modern tech startup logo"

# Generate with custom output directory
npm run manager -- generate homepage_mockup "Clean SaaS landing page" -o ./managers

# Quick generation without web inspiration (faster)
npm run manager -- generate favicon "Simple geometric icon" --no-inspiration

# Search for manager inspiration
npm run manager -- search dribbble "mobile app manager" -l 5

# List all available manager types
npm run manager -- list-types

# Show usage examples
npm run manager -- examples
```

## API Reference

### Main Functions

#### `manager_image(type, prompt, with_inspiration, brand_assets)`

Generates a high-quality manager through a multi-stage process.

**Parameters:**
- `type`: Manager asset type ('primary_logo', 'homepage_mockup', 'color_pallet', etc.)
- `prompt`: Text description of the desired manager
- `with_inspiration`: Whether to search web for reference images (default: true)
- `brand_assets`: Array of existing brand asset file paths for consistency

**Returns:** Promise<string> - Path to the generated high-quality image

#### `manager_search(engine, query, limit)`

Searches manager platforms for inspiration.

**Parameters:**
- `engine`: Search engine ('dribbble', 'behance', 'envato', etc.)
- `query`: Search query string
- `limit`: Maximum number of results (default: 9)

**Returns:** Promise<string> - JSON string of search results

### Tool Functions

#### `getManagerImageTools()`

Returns tool function definitions for manager image generation, suitable for use with LLM agents.

#### `getImageGenerationTools()`

Returns tool function definitions for basic image generation.

## Manager Asset Types

Supported manager asset types include:

- `primary_logo` - Full wordmark for headers and branding
- `logomark_icon` - Square symbol for avatars and favicons
- `homepage_mockup` - Pixel-perfect homepage manager
- `color_pallet` - Brand color swatches and neutrals
- `component_sheet` - UI component managers and states
- `favicon` - Browser tab icon
- And many more...

## Configuration

### Environment Variables

- `MANAGER_OUTPUT_DIR` - Directory for saved images (default: `.output/` in current directory)

### Advanced Usage

```typescript
import { 
    manager_image, 
    smart_manager_raw,
    MANAGER_ASSET_TYPES 
} from '@just-every/manager';

// Use advanced search configurations
const searchConfigs = [
    { engine: 'dribbble', query: 'tech startup logo' },
    { engine: 'behance', query: 'modern brand identity' }
];

const inspirationResults = await smart_manager_raw(
    searchConfigs,
    3, // Final limit
    'primary_logo',
    'Look for clean, modern managers with good typography'
);

// Generate logo with specific inspiration
const logoPath = await manager_image(
    'primary_logo',
    'Innovative AI platform logo',
    false, // Don't search again
    [] // No existing assets
);
```

## Architecture

The manager generation process follows these stages:

1. **Specification Generation** - LLM creates detailed manager specifications
2. **Inspiration Search** - Optional web search for reference imagery  
3. **Draft Phase** - Generate multiple low-resolution concept variations
4. **Selection Phase** - AI vision model selects best concepts
5. **Medium Phase** - Enhance selected managers with more detail
6. **High Phase** - Create final high-quality version with validation

## Limitations

This standalone version has some limitations compared to the full MAGI system:

- Simplified manager search (no live browser automation)
- Basic screenshot functionality (placeholder images)
- Console logging instead of UI communication
- Limited to supported LLM providers

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## License

MIT