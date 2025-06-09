import path from 'path';
import { getDB } from './db.js';
import fs from 'fs/promises';

interface CustomTool {
    name: string;
    description: string;
    parameters_json: string;
    version?: number;
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

// Detect if we're running locally or in Docker
const isLocal = !fileExists('/app/db');
const TOOLS_DIR = isLocal
    ? path.resolve(process.cwd(), '../custom_tools') // Local: relative to controller dir
    : path.resolve('/custom_tools'); // Docker: absolute path

async function readLocalTools(): Promise<CustomTool[]> {
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
            if (
                !(await fileExists(codePathTs)) &&
                !(await fileExists(codePathJs))
            ) {
                continue;
            }
            tools.push({
                name,
                description: meta.description || '',
                parameters_json: meta.parameters_json || '{}',
                version: meta.version || 1,
            });
        }
    } catch (err) {
        console.error('Error reading local tools:', err);
    }
    return tools;
}

export async function syncLocalCustomTools(): Promise<void> {
    const client = await getDB();
    try {
        const { rows } = await client.query(
            'SELECT name FROM custom_tools WHERE is_latest = true'
        );
        const existing = new Set<string>(rows.map(r => r.name));

        const localTools = await readLocalTools();
        const localNames = new Set(localTools.map(t => t.name));

        for (const tool of localTools) {
            await client.query(
                `INSERT INTO custom_tools (name, description, parameters_json, version, is_latest)
                 VALUES ($1,$2,$3,$4,true)
                 ON CONFLICT (name)
                 DO UPDATE SET description=EXCLUDED.description,
                               parameters_json=EXCLUDED.parameters_json,
                               version=EXCLUDED.version,
                               is_latest=true`,
                [
                    tool.name,
                    tool.description,
                    tool.parameters_json,
                    tool.version || 1,
                ]
            );
        }

        for (const name of existing) {
            if (!localNames.has(name)) {
                await client.query('DELETE FROM custom_tools WHERE name = $1', [
                    name,
                ]);
            }
        }
    } catch (err) {
        console.error('Error syncing local custom tools:', err);
    } finally {
        client.release();
    }
}
