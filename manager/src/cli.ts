#!/usr/bin/env node

/**
 * Command-line interface for @just-every/manager
 */

// Load environment variables FIRST before any other imports
import { config } from 'dotenv';
config();

// Now import everything else
import { program } from 'commander';
import { manager_image } from './manager-image.js';
import { manager_search } from './manager-search.js';
import { MANAGER_ASSET_REFERENCE, MANAGER_SEARCH_ENGINES } from './constants.js';
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
    .name('manager-tool')
    .description('Intelligent manager image generation tool')
    .version(packageJson.version);

// Main manager generation command
program
    .command('generate')
    .description('Generate a manager image')
    .argument('<type>', `Manager asset type (${Object.keys(MANAGER_ASSET_REFERENCE).join(', ')})`)
    .argument('<prompt>', 'Text description of the desired manager')
    .option('-o, --output <path>', 'Output directory for generated images')
    .option('--no-inspiration', 'Skip web inspiration search (faster but lower quality)')
    .option('-b, --brand-assets <paths...>', 'Existing brand asset file paths for consistency')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (type, prompt, options) => {
        try {
            // Validate manager type
            if (!Object.keys(MANAGER_ASSET_REFERENCE).includes(type)) {
                console.error(`Error: Invalid manager type "${type}"`);
                console.error(`Valid types: ${Object.keys(MANAGER_ASSET_REFERENCE).join(', ')}`);
                process.exit(1);
            }

            // Set output directory if specified
            if (options.output) {
                process.env.MANAGER_OUTPUT_DIR = path.resolve(options.output);
            }

            // Enable verbose logging if requested
            if (options.verbose) {
                console.log(`Manager type: ${type}`);
                console.log(`Prompt: ${prompt}`);
                console.log(`Use inspiration: ${options.inspiration}`);
                console.log(`Brand assets: ${options.brandAssets || 'none'}`);
                console.log(`Output directory: ${process.env.MANAGER_OUTPUT_DIR || path.join(process.cwd(), '.output')}`);
                console.log('');
            }

            console.log('🎨 Starting manager generation...');
            
            const startTime = Date.now();
            const imagePath = await manager_image(
                type,
                prompt,
                options.inspiration !== false,
                options.brandAssets || []
            );
            const duration = Math.round((Date.now() - startTime) / 1000);

            console.log('');
            console.log('✅ Manager generation complete!');
            console.log(`📁 Image saved to: ${imagePath}`);
            console.log(`⏱️  Duration: ${duration}s`);

        } catch (error) {
            console.error('❌ Error generating manager:', error instanceof Error ? error.message : String(error));
            if (options.verbose) {
                console.error(error instanceof Error ? error.stack : error);
            }
            process.exit(1);
        }
    });

// Manager search command
program
    .command('search')
    .description('Search for manager inspiration')
    .argument('<engine>', `Search engine (${MANAGER_SEARCH_ENGINES.join(', ')})`)
    .argument('<query>', 'Search query')
    .option('-l, --limit <number>', 'Maximum number of results', '9')
    .option('-o, --output <path>', 'Output file for search results (JSON)')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (engine, query, options) => {
        try {
            // Validate search engine
            if (!MANAGER_SEARCH_ENGINES.includes(engine)) {
                console.error(`Error: Invalid search engine "${engine}"`);
                console.error(`Valid engines: ${MANAGER_SEARCH_ENGINES.join(', ')}`);
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
            const results = await manager_search(engine, query, limit);
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

// List available manager types
program
    .command('list-types')
    .description('List all available manager asset types')
    .action(() => {
        console.log('📋 Available manager asset types:\n');
        
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

        console.log('Use "manager-tool generate <type> <prompt>" to create a manager.');
    });

// List available search engines
program
    .command('list-engines')
    .description('List all available manager search engines')
    .action(() => {
        console.log('🔍 Available manager search engines:\n');
        
        MANAGER_SEARCH_ENGINES.forEach(engine => {
            console.log(`• ${engine}`);
        });
        
        console.log('\nUse "manager-tool search <engine> <query>" to search for inspiration.');
    });

// Examples command
program
    .command('examples')
    .description('Show usage examples')
    .action(() => {
        console.log('💡 Usage Examples:\n');
        
        console.log('Generate a logo:');
        console.log('  manager-tool generate primary_logo "Modern tech startup logo"\n');
        
        console.log('Generate a homepage mockup with brand assets:');
        console.log('  manager-tool generate homepage_mockup "Clean SaaS landing page" -b logo.png colors.png\n');
        
        console.log('Quick generation without inspiration:');
        console.log('  manager-tool generate favicon "Simple geometric icon" --no-inspiration\n');
        
        console.log('Search for manager inspiration:');
        console.log('  manager-tool search dribbble "mobile app manager"\n');
        
        console.log('Search and save results:');
        console.log('  manager-tool search behance "logo manager" -o results.json\n');
        
        console.log('Generate with custom output directory:');
        console.log('  manager-tool generate color_pallet "Earth tones palette" -o ./my-managers\n');
    });

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}