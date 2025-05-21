import fs from 'fs';
import path from 'path';
import { quick_llm_call } from '../llm_call_utils.js';
import {
    design_search,
    createNumberedGrid,
    type ImageSource,
} from '../design_search.js';
import { write_unique_file } from '../file_utils.js';
import type { ResponseInput } from '../../types/shared-types.js';
import type { DesignSearchResult } from './constants.js';

const DESIGN_ASSETS_DIR = '/magi_output/shared/design_assets';

export interface VibeDocResult {
    docPath: string;
    competitorQueries: string[];
    imagePaths: string[];
}

export async function generate_design_vibe_doc(
    spec: string
): Promise<VibeDocResult> {
    const promptMessages: ResponseInput = [
        {
            type: 'message',
            role: 'system',
            content:
                'You are a design strategist tasked with identifying competitor websites for inspiration.',
        },
        {
            type: 'message',
            role: 'user',
            content: `SITE SPECIFICATION:\n${spec}\n\nList 3 competitor website names or search queries that would provide good design inspiration. Respond with JSON.`,
        },
    ];

    const raw = await quick_llm_call(promptMessages, 'reasoning', {
        name: 'CompetitorFinder',
        description: 'Find competitor inspiration',
        instructions:
            'Return a JSON object {"competitors": ["..."]} with 3 short names or queries.',
        modelSettings: {
            force_json: true,
            json_schema: {
                name: 'competitors',
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        competitors: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 1,
                            maxItems: 5,
                        },
                    },
                    required: ['competitors'],
                    additionalProperties: false,
                },
            },
        },
    });

    const parsed = JSON.parse(raw);
    const queries: string[] = parsed.competitors;

    const results: DesignSearchResult[] = [];
    for (const query of queries) {
        try {
            const res = await design_search('web_search', query, 3);
            const arr: DesignSearchResult[] = JSON.parse(res);
            results.push(...arr.slice(0, 3));
        } catch (error) {
            console.error('design_search failed for', query, error);
        }
    }

    const valid = results.filter(r => r.screenshotURL).slice(0, 9);
    const grid = await createNumberedGrid(
        valid as unknown as ImageSource[],
        'vibe'
    );

    const analysisMessages: ResponseInput = [
        {
            type: 'message',
            role: 'system',
            content:
                'You are a senior web art director who writes short vibe docs summarizing design direction.',
        },
        {
            type: 'message',
            role: 'user',
            content: `SITE SPECIFICATION:\n${spec}\n\nThe following grid shows screenshots from competitor or inspirational sites. Summarize the common themes and describe how our site should be similar or different. Respond with a short Markdown document.`,
        },
        { type: 'message', role: 'user', content: grid },
    ];

    const doc = await quick_llm_call(analysisMessages, 'vision', {
        name: 'VibeDocWriter',
        description: 'Write vibe doc from competitor screenshots',
        instructions:
            'Analyze the screenshots and return a short markdown design brief summarizing the vibe and how to differentiate.',
    });

    const vibeDir = path.join(DESIGN_ASSETS_DIR, 'vibe_docs');
    if (!fs.existsSync(vibeDir)) {
        fs.mkdirSync(vibeDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const docPath = path.join(vibeDir, `vibe_doc_${timestamp}.md`);
    write_unique_file(docPath, doc);

    return {
        docPath,
        competitorQueries: queries,
        imagePaths: valid.map(v => v.screenshotURL as string),
    };
}
