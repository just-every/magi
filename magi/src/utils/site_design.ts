import fs from 'fs';
import {
    DESIGN_ASSET_REFERENCE,
    type DESIGN_ASSET_TYPES,
} from './design/constants.js';
import { quick_llm_call } from './llm_call_utils.js';
import { design_image } from './image_generation.js';
import {
    generate_design_vibe_doc,
    type VibeDocResult,
} from './design/vibe_doc.js';
import type { ResponseInput } from '@just-every/ensemble';

/**
 * Plan which design assets are needed for a project using an LLM.
 */
export async function select_design_assets(
    prompt: string
): Promise<DESIGN_ASSET_TYPES[]> {
    const list = Object.entries(DESIGN_ASSET_REFERENCE)
        .map(([k, v]) => `- ${k}: ${v.description}`)
        .join('\n');
    const choices = Object.keys(DESIGN_ASSET_REFERENCE) as DESIGN_ASSET_TYPES[];

    const messages: ResponseInput = [
        {
            type: 'message',
            role: 'system',
            content:
                'You are a design planner that selects required design assets for a website.',
        },
        {
            type: 'message',
            role: 'user',
            content: `PROJECT DESCRIPTION:\n${prompt}\n\nAVAILABLE ASSETS:\n${list}\n\nReturn the list of asset keys needed for this project in JSON form.`,
        },
    ];

    const raw = await quick_llm_call(messages, 'reasoning', {
        name: 'DesignPlanner',
        description: 'Select design assets',
        instructions:
            'Respond with {"assets": [..]} only using the provided keys and order of creation.',
        modelSettings: {
            force_json: true,
            json_schema: {
                name: 'asset_plan',
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        assets: {
                            type: 'array',
                            items: { type: 'string', enum: choices },
                        },
                    },
                    required: ['assets'],
                    additionalProperties: false,
                },
            },
        },
    });

    const parsed = JSON.parse(raw);
    return parsed.assets as DESIGN_ASSET_TYPES[];
}

/**
 * Resolve dependencies for a list of assets.
 */
export function resolve_design_dependencies(
    assets: DESIGN_ASSET_TYPES[]
): DESIGN_ASSET_TYPES[] {
    const result = new Set<DESIGN_ASSET_TYPES>();
    function add(key: DESIGN_ASSET_TYPES) {
        if (result.has(key)) return;
        DESIGN_ASSET_REFERENCE[key].depends_on.forEach(dep =>
            add(dep as DESIGN_ASSET_TYPES)
        );
        result.add(key);
    }
    assets.forEach(add);
    return Array.from(result);
}

export interface SiteDesignResult {
    vibe: VibeDocResult;
    assets: Record<DESIGN_ASSET_TYPES, string>;
}

/**
 * Generate all design assets for a site, using a vibe doc for direction and
 * ensuring dependencies are respected.
 */
export async function generate_site_design(
    prompt: string,
    with_inspiration = true
): Promise<SiteDesignResult> {
    const vibe = await generate_design_vibe_doc(prompt);
    const vibeText = fs.readFileSync(vibe.docPath, 'utf-8');
    const designPrompt = `${prompt}\n\nVIBE:\n${vibeText}`;

    const planned = await select_design_assets(designPrompt);
    const all = resolve_design_dependencies(planned);
    const pending = new Set<DESIGN_ASSET_TYPES>(all);
    const generated: Record<DESIGN_ASSET_TYPES, string> = {} as Record<
        DESIGN_ASSET_TYPES,
        string
    >;

    while (pending.size > 0) {
        let progressed = false;
        for (const asset of Array.from(pending)) {
            const deps = DESIGN_ASSET_REFERENCE[asset]
                .depends_on as DESIGN_ASSET_TYPES[];
            if (deps.every(d => generated[d])) {
                const refPaths = Object.values(generated);
                const path = await design_image(
                    asset,
                    designPrompt,
                    with_inspiration,
                    refPaths
                );
                generated[asset] = path;
                pending.delete(asset);
                progressed = true;
            }
        }
        if (!progressed) throw new Error('Unresolvable dependencies');
    }

    return { vibe, assets: generated };
}
