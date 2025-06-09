#!/usr/bin/env node

/**
 * Command-line interface for @just-every/design
 */

// Load environment variables FIRST before any other imports
import { config } from 'dotenv';
config();

// Now import everything else
import { program } from 'commander';
import { design_image } from './design-image.js';
import { design_search } from './design-search.js';
import { DESIGN_ASSET_REFERENCE, DESIGN_SEARCH_ENGINES } from './constants.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeLLMLogger } from './utils/logger.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Package info
const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
);

// Initialize LLM logger
initializeLLMLogger();

program
    .name('design-tool')
    .description('Intelligent design image generation tool')
    .version(packageJson.version);

// Main design generation command
program
    .command('generate')
    .description('Generate a design image')
    .argument('<type>', `Design asset type (${Object.keys(DESIGN_ASSET_REFERENCE).join(', ')})`)
    .argument('<prompt>', 'Text description of the desired design')
    .option('-o, --output <path>', 'Output directory for generated images')
    .option('--no-inspiration', 'Skip web inspiration search (faster but lower quality)')
    .option('-b, --brand-assets <paths...>', 'Existing brand asset file paths for consistency')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (type, prompt, options) => {
        try {
            // Validate design type
            if (!Object.keys(DESIGN_ASSET_REFERENCE).includes(type)) {
                console.error(`Error: Invalid design type "${type}"`);
                console.error(`Valid types: ${Object.keys(DESIGN_ASSET_REFERENCE).join(', ')}`);
                process.exit(1);
            }

            // Set output directory if specified
            if (options.output) {
                process.env.DESIGN_OUTPUT_DIR = path.resolve(options.output);
            }

            // Enable verbose logging if requested
            if (options.verbose) {
                console.log(`Design type: ${type}`);
                console.log(`Prompt: ${prompt}`);
                console.log(`Use inspiration: ${options.inspiration}`);
                console.log(`Brand assets: ${options.brandAssets || 'none'}`);
                console.log(`Output directory: ${process.env.DESIGN_OUTPUT_DIR || path.join(process.cwd(), '.output')}`);
                console.log('');
            }

            console.log('🎨 Starting design generation...');
            
            const startTime = Date.now();
            const imagePath = await design_image(
                type,
                prompt,
                options.inspiration !== false,
                options.brandAssets || []
            );
            const duration = Math.round((Date.now() - startTime) / 1000);

            console.log('');
            console.log('✅ Design generation complete!');
            console.log(`📁 Image saved to: ${imagePath}`);
            console.log(`⏱️  Duration: ${duration}s`);

        } catch (error) {
            console.error('❌ Error generating design:', error instanceof Error ? error.message : String(error));
            if (options.verbose) {
                console.error(error instanceof Error ? error.stack : error);
            }
            process.exit(1);
        }
    });

// Design search command
program
    .command('search')
    .description('Search for design inspiration')
    .argument('<engine>', `Search engine (${DESIGN_SEARCH_ENGINES.join(', ')})`)
    .argument('<query>', 'Search query')
    .option('-l, --limit <number>', 'Maximum number of results', '9')
    .option('-o, --output <path>', 'Output file for search results (JSON)')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (engine, query, options) => {
        try {
            // Validate search engine
            if (!DESIGN_SEARCH_ENGINES.includes(engine)) {
                console.error(`Error: Invalid search engine "${engine}"`);
                console.error(`Valid engines: ${DESIGN_SEARCH_ENGINES.join(', ')}`);
                process.exit(1);
            }

            const limit = parseInt(options.limit);
            if (isNaN(limit) || limit < 1) {
                console.error('Error: Limit must be a positive number');
                process.exit(1);
            }

            if (options.verbose) {
                console.log(`Search engine: ${engine}`);
                console.log(`Query: ${query}`);
                console.log(`Limit: ${limit}`);
                console.log('');
            }

            console.log(`🔍 Searching ${engine} for "${query}"...`);
            
            const startTime = Date.now();
            const results = await design_search(engine, query, limit);
            const duration = Math.round((Date.now() - startTime) / 1000);

            const parsedResults = JSON.parse(results);
            
            console.log('');
            console.log('✅ Search complete!');
            console.log(`📊 Found ${parsedResults.length} results`);
            console.log(`⏱️  Duration: ${duration}s`);

            // Save to file if output specified
            if (options.output) {
                const outputPath = path.resolve(options.output);
                fs.writeFileSync(outputPath, results);
                console.log(`📁 Results saved to: ${outputPath}`);
            }

            // Display results summary
            if (options.verbose) {
                console.log('\n📋 Results:');
                parsedResults.forEach((result: any, index: number) => {
                    console.log(`  ${index + 1}. ${result.title || 'Untitled'}`);
                    console.log(`     ${result.url}`);
                    if (result.screenshotURL) {
                        console.log(`     Screenshot: ${result.screenshotURL}`);
                    }
                    console.log('');
                });
            }

        } catch (error) {
            console.error('❌ Error searching:', error instanceof Error ? error.message : String(error));
            if (options.verbose) {
                console.error(error instanceof Error ? error.stack : error);
            }
            process.exit(1);
        }
    });

// List available design types
program
    .command('list-types')
    .description('List all available design asset types')
    .action(() => {
        console.log('📋 Available design asset types:\n');
        
        const typeGroups = {
            'Branding': ['primary_logo', 'logomark_icon', 'color_pallet', 'favicon'],
            'UI/UX': ['homepage_mockup', 'component_sheet', 'dashboard_page_mockup'],
            'Content': ['hero_images', 'team_headshots', 'infographics'],
            'Marketing': ['open_graph_card', 'twitter_card', 'email_banner']
        };

        Object.entries(typeGroups).forEach(([category, types]) => {
            console.log(`${category}:`);
            types.forEach(type => {
                console.log(`  • ${type}`);
            });
            console.log('');
        });

        console.log('Use "design-tool generate <type> <prompt>" to create a design.');
    });

// List available search engines
program
    .command('list-engines')
    .description('List all available design search engines')
    .action(() => {
        console.log('🔍 Available design search engines:\n');
        
        DESIGN_SEARCH_ENGINES.forEach(engine => {
            console.log(`• ${engine}`);
        });
        
        console.log('\nUse "design-tool search <engine> <query>" to search for inspiration.');
    });

// Examples command
program
    .command('examples')
    .description('Show usage examples')
    .action(() => {
        console.log('💡 Usage Examples:\n');
        
        console.log('Generate a logo:');
        console.log('  design-tool generate primary_logo "Modern tech startup logo"\n');
        
        console.log('Generate a homepage mockup with brand assets:');
        console.log('  design-tool generate homepage_mockup "Clean SaaS landing page" -b logo.png colors.png\n');
        
        console.log('Quick generation without inspiration:');
        console.log('  design-tool generate favicon "Simple geometric icon" --no-inspiration\n');
        
        console.log('Search for design inspiration:');
        console.log('  design-tool search dribbble "mobile app design"\n');
        
        console.log('Search and save results:');
        console.log('  design-tool search behance "logo design" -o results.json\n');
        
        console.log('Generate with custom output directory:');
        console.log('  design-tool generate color_pallet "Earth tones palette" -o ./my-designs\n');
    });

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}