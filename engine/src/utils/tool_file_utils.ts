import fs from 'fs/promises';
import path from 'path';
import { CustomTool } from './db_utils.js';

export const TOOLS_DIR = path.resolve('/custom_tools');

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

export async function saveToolFiles(tool: CustomTool): Promise<void> {
    await fs.mkdir(TOOLS_DIR, { recursive: true });
    const codePath = path.join(TOOLS_DIR, `${tool.name}.ts`);
    const metaPath = path.join(TOOLS_DIR, `${tool.name}.json`);
    await fs.writeFile(codePath, tool.implementation, 'utf8');
    const meta = {
        description: tool.description,
        parameters_json: tool.parameters_json,
        version: tool.version || 1,
    };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

export async function readToolImplementation(
    name: string
): Promise<string | null> {
    const codePathTs = path.join(TOOLS_DIR, `${name}.ts`);
    const codePathJs = path.join(TOOLS_DIR, `${name}.js`);
    if (await fileExists(codePathTs)) return fs.readFile(codePathTs, 'utf8');
    if (await fileExists(codePathJs)) return fs.readFile(codePathJs, 'utf8');
    return null;
}

export async function deleteToolFiles(name: string): Promise<void> {
    const codePathTs = path.join(TOOLS_DIR, `${name}.ts`);
    const codePathJs = path.join(TOOLS_DIR, `${name}.js`);
    const metaPath = path.join(TOOLS_DIR, `${name}.json`);
    if (await fileExists(codePathTs)) await fs.unlink(codePathTs);
    if (await fileExists(codePathJs)) await fs.unlink(codePathJs);
    if (await fileExists(metaPath)) await fs.unlink(metaPath);
}

export async function readLocalTools(): Promise<CustomTool[]> {
    const tools: CustomTool[] = [];
    try {
        await fs.mkdir(TOOLS_DIR, { recursive: true });
        const files = await fs.readdir(TOOLS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const name = file.replace(/\.json$/, '');
            const metaRaw = await fs.readFile(
                path.join(TOOLS_DIR, file),
                'utf8'
            );
            let meta: any = {};
            try {
                meta = JSON.parse(metaRaw);
            } catch {
                continue;
            }
            const codePathTs = path.join(TOOLS_DIR, `${name}.ts`);
            const codePathJs = path.join(TOOLS_DIR, `${name}.js`);
            let implementation = '';
            if (await fileExists(codePathTs)) {
                implementation = await fs.readFile(codePathTs, 'utf8');
            } else if (await fileExists(codePathJs)) {
                implementation = await fs.readFile(codePathJs, 'utf8');
            } else {
                continue;
            }
            tools.push({
                name,
                description: meta.description || '',
                parameters_json: meta.parameters_json || '{}',
                implementation,
                version: meta.version || 1,
                is_latest: true,
            });
        }
    } catch (err) {
        console.error('Error reading local tools:', err);
    }
    return tools;
}
