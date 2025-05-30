/**
 * Design Agent for Website Construction
 *
 * Specializes in Phase C of website construction:
 * - Researching design inspiration
 * - Analyzing design patterns and color schemes
 * - Generating UI mockups via image generation
 * - Creating component-level designs
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import { getImageGenerationTools } from '../../utils/image_generation.js';
import {
    getDesignSearchTools,
    getSmartDesignTools,
} from '../../utils/design_search.js';
import { MAGI_CONTEXT } from '../constants.js';
import { createReasoningAgent } from '../common_agents/reasoning_agent.js';
import {
    addBrowserStatus,
    setupAgentBrowserTools,
} from '../../utils/browser_utils.js';
import { addDesignAssetsStatus } from '../../utils/design_assets.js';
import {
    getProcessProjectIds,
    getProcessProjectPorts,
} from '../../utils/project_utils.js';
import { ResponseInput } from '@just-every/ensemble';

/**
 * Create the design agent for specialized UI design tasks
 *
 * @returns The configured DesignAgent instance
 */
export function createDesignAgent(): Agent {
    const agent = new Agent({
        name: 'WebDesignAgent',
        description:
            'Specializes in UI design, mockups and visual assets for websites',
        instructions: `${MAGI_CONTEXT}
---

You are a Design Agent specializing in creating user interfaces and visual assets for websites.
Your primary responsibilities are:

1. RESEARCH INSPIRATION
   - Collect reference designs from Dribbble, Behance, Pinterest and other sources
   - Analyze successful websites in the target industry/niche
   - Extract common patterns, color schemes, and layout strategies
   - Use the smart_design tool to gather screenshots from multiple sources and automatically narrow down the best examples

2. VISUAL DESIGN PLANNING
   - Define a consistent color palette based on client needs and industry standards
   - Plan typography with appropriate font pairings and hierarchy
   - Design a cohesive visual language (buttons, cards, forms, etc.)

3. MOCKUP GENERATION
   - Use image_generation tools to create full-page mockups for key pages:
     * Home page
     * Product/service pages
     * About/contact pages
     * Dashboards (if applicable)
   - Create component-level designs for reusable elements
   - Ensure designs are consistent and follow modern web design practices

4. ASSET MANAGEMENT
   - Save all generated designs in /design_assets/ directory
   - Create a manifest.json file listing all assets and their purposes
   - Ensure proper naming conventions for easy frontend implementation

DESIGN PRINCIPLES:
• Mobile-first: Design for mobile before scaling up to desktop
• Atomic design: Break designs into atoms → molecules → organisms → templates → pages
• Accessibility: Ensure sufficient contrast ratios and readable typography
• Consistent spacing: Use a consistent spacing system (e.g., 4px/8px grid)
• Clear hierarchy: Make information priority clear through visual hierarchy

DO NOT:
• Create designs that don't match current web capabilities and standards
• Ignore stated brand guidelines or goals
• Design without considering technical feasibility
• Use low-contrast text or tiny font sizes

ASSET ORGANIZATION:
Save assets in a structured format:
/design_assets/
  /pages/          # Full page mockups
  /components/     # Reusable components
  /brand/          # Logo, color palette, etc.
  manifest.json    # Asset inventory and metadata

The frontend engineer will use your designs as reference for implementation, so clarity is critical.
`,
        tools: [
            ...getDesignSearchTools(),
            ...getSmartDesignTools(),
            ...getImageGenerationTools(),
            ...getCommonTools(),
        ],
        workers: [createReasoningAgent],
        modelClass: 'vision',
        onRequest: async (
            a: Agent,
            m: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            [a, m] = await addBrowserStatus(a, m);
            return addDesignAssetsStatus(a, m);
        },
    });

    const ports = getProcessProjectPorts();
    const ids = getProcessProjectIds();
    let startUrl: string | undefined;
    for (const id of ids) {
        if (ports[id]) {
            startUrl = `http://localhost:${ports[id]}`;
            break;
        }
    }
    void setupAgentBrowserTools(agent, startUrl).catch(err =>
        console.error('Failed to setup browser for WebDesignAgent', err)
    );

    return agent;
}
