# @just-every/design

A standalone design image generation tool extracted from the MAGI system. This package provides intelligent design image generation capabilities with minimal dependencies.

## Features

- **Multi-stage Design Generation**: Creates designs through draft, medium, and high-quality phases
- **Design Inspiration Search**: Searches design platforms for reference imagery
- **Vision-based Selection**: Uses AI vision models to select the best design variations
- **Comprehensive Asset Types**: Supports logos, mockups, color palettes, and more
- **Quality Assurance**: Automatic validation of generated designs against criteria

## Installation

```bash
npm install @just-every/design
```

### Development Setup

If you're contributing to or testing this package:

```bash
# Clone the repository
git clone <repository-url>
cd design
npm install
npm run build

# Run the design tool for testing
npm run design -- <command> [options]
```

## Dependencies

This package requires:
- `@just-every/ensemble` - LLM provider interfaces
- `@just-every/task` - Task functionality for intelligent model selection

## Quick Start

### Library Usage

```typescript
import { design_image } from '@just-every/design';

// Generate a logo design
const logoPath = await design_image(
    'primary_logo',
    'A modern tech startup logo with clean typography',
    true, // Use web inspiration
    [] // No existing brand assets
);

console.log(`Generated logo saved to: ${logoPath}`);
```

### Development Usage

For development and testing, you can use the `npm run design` command:

```bash
# Generate a logo
npm run design -- generate primary_logo "Modern tech startup logo"

# Generate with custom output directory
npm run design -- generate homepage_mockup "Clean SaaS landing page" -o ./designs

# Quick generation without web inspiration (faster)
npm run design -- generate favicon "Simple geometric icon" --no-inspiration

# Search for design inspiration
npm run design -- search dribbble "mobile app design" -l 5

# List all available design types
npm run design -- list-types

# Show usage examples
npm run design -- examples
```

## API Reference

### Main Functions

#### `design_image(type, prompt, with_inspiration, brand_assets)`

Generates a high-quality design through a multi-stage process.

**Parameters:**
- `type`: Design asset type ('primary_logo', 'homepage_mockup', 'color_pallet', etc.)
- `prompt`: Text description of the desired design
- `with_inspiration`: Whether to search web for reference images (default: true)
- `brand_assets`: Array of existing brand asset file paths for consistency

**Returns:** Promise<string> - Path to the generated high-quality image

#### `design_search(engine, query, limit)`

Searches design platforms for inspiration.

**Parameters:**
- `engine`: Search engine ('dribbble', 'behance', 'envato', etc.)
- `query`: Search query string
- `limit`: Maximum number of results (default: 9)

**Returns:** Promise<string> - JSON string of search results

### Tool Functions

#### `getDesignImageTools()`

Returns tool function definitions for design image generation, suitable for use with LLM agents.

#### `getImageGenerationTools()`

Returns tool function definitions for basic image generation.

## Design Asset Types

Supported design asset types include:

- `primary_logo` - Full wordmark for headers and branding
- `logomark_icon` - Square symbol for avatars and favicons
- `homepage_mockup` - Pixel-perfect homepage design
- `color_pallet` - Brand color swatches and neutrals
- `component_sheet` - UI component designs and states
- `favicon` - Browser tab icon
- And many more...

## Configuration

### Environment Variables

- `DESIGN_OUTPUT_DIR` - Directory for saved images (default: `.output/` in current directory)

### Advanced Usage

```typescript
import { 
    design_image, 
    smart_design_raw,
    DESIGN_ASSET_TYPES 
} from '@just-every/design';

// Use advanced search configurations
const searchConfigs = [
    { engine: 'dribbble', query: 'tech startup logo' },
    { engine: 'behance', query: 'modern brand identity' }
];

const inspirationResults = await smart_design_raw(
    searchConfigs,
    3, // Final limit
    'primary_logo',
    'Look for clean, modern designs with good typography'
);

// Generate logo with specific inspiration
const logoPath = await design_image(
    'primary_logo',
    'Innovative AI platform logo',
    false, // Don't search again
    [] // No existing assets
);
```

## Architecture

The design generation process follows these stages:

1. **Specification Generation** - LLM creates detailed design specifications
2. **Inspiration Search** - Optional web search for reference imagery  
3. **Draft Phase** - Generate multiple low-resolution concept variations
4. **Selection Phase** - AI vision model selects best concepts
5. **Medium Phase** - Enhance selected designs with more detail
6. **High Phase** - Create final high-quality version with validation

## Limitations

This standalone version has some limitations compared to the full MAGI system:

- Simplified design search (no live browser automation)
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