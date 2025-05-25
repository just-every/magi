import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { getDB } from '../utils/db.js';

const router = Router();

// Custom tools are stored in a Docker volume mounted at /custom_tools
// Use an absolute path so the server can locate tools regardless of CWD
const TOOLS_DIR = path.resolve('/custom_tools');

function sanitizeToolName(name: string): string {
    return path.basename(name).replace(/[^a-zA-Z0-9_-]/g, '');
}

async function readToolImplementation(
    name: string
): Promise<string | undefined> {
    const safeName = sanitizeToolName(name);
    const tsPath = path.join(TOOLS_DIR, `${safeName}.ts`);
    const jsPath = path.join(TOOLS_DIR, `${safeName}.js`);
    try {
        return await fs.readFile(tsPath, 'utf8');
    } catch {
        try {
            return await fs.readFile(jsPath, 'utf8');
        } catch {
            return undefined;
        }
    }
}

router.get('/', async (_req, res) => {
    const db = await getDB();
    try {
        const result = await db.query(
            `SELECT name, description, parameters_json, version, source_task_id, is_latest, created_at
             FROM custom_tools
             WHERE is_latest = true
             ORDER BY name`
        );
        const tools = await Promise.all(
            result.rows.map(async row => {
                const implementation = await readToolImplementation(row.name);
                return { ...row, implementation };
            })
        );
        res.json(tools);
    } catch (error) {
        console.error('Error fetching custom tools:', error);
        res.status(500).json({ error: 'Failed to fetch custom tools' });
    } finally {
        db.release();
    }
});

router.get('/:name', async (req, res) => {
    const name = sanitizeToolName(req.params.name);
    const db = await getDB();
    try {
        const result = await db.query(
            `SELECT name, description, parameters_json, version, source_task_id, is_latest, created_at
             FROM custom_tools
             WHERE name = $1`,
            [name]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Custom tool not found' });
            return;
        }
        const implementation = await readToolImplementation(name);
        res.json({ ...result.rows[0], implementation });
    } catch (error) {
        console.error(`Error fetching custom tool ${name}:`, error);
        res.status(500).json({ error: 'Failed to fetch custom tool' });
    } finally {
        db.release();
    }
});

export default router;
