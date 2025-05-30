import fs from 'fs';
import path from 'path';
import { Agent } from './agent.js';
import { ResponseInput } from '@just-every/ensemble';
import {
    DESIGN_ASSETS_DIR,
    createNumberedGrid,
    ImageSource,
} from './design_search.js';
import { getCommunicationManager } from './communication.js';

export function listDesignAssetFiles(): string[] {
    const results: string[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) {
                results.push(full);
            }
        }
    };
    walk(DESIGN_ASSETS_DIR);
    return results;
}

export async function createDesignAssetsCollage(
    limit = 9
): Promise<string | null> {
    const files = listDesignAssetFiles()
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
        .slice(0, limit);
    if (files.length === 0) return null;
    const images: ImageSource[] = files.map(f => ({ url: f }));
    return createNumberedGrid(images, 'all_design_assets');
}

export async function addDesignAssetsStatus(
    agent: Agent,
    messages: ResponseInput
): Promise<[Agent, ResponseInput]> {
    const collage = await createDesignAssetsCollage();
    if (collage) {
        messages.push({
            type: 'message',
            role: 'developer',
            content: `### Design Assets\n${collage}`,
        });
        const comm = getCommunicationManager();
        comm.send({
            agent: agent.export(),
            type: 'design_grid',
            data: collage,
            timestamp: new Date().toISOString(),
        });
    }
    return [agent, messages];
}
