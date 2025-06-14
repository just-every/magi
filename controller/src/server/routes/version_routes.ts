/**
 * Version management API routes
 */
import { Router, Request, Response } from 'express';
import { VersionManager } from '../managers/version_manager';

export function createVersionRoutes(versionManager: VersionManager): Router {
    const router = Router();

    /**
     * Get all available versions
     */
    router.get('/versions', async (req: Request, res: Response) => {
        try {
            const versions = await versionManager.getVersions();
            res.json({
                success: true,
                versions,
                current: versionManager.getCurrentActiveVersion(),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    /**
     * Update containers to a specific version
     */
    router.post('/versions/update', async (req: Request, res: Response) => {
        try {
            const { version, strategy = 'rolling', containers } = req.body;
            
            if (!version) {
                return res.status(400).json({
                    success: false,
                    error: 'Version is required',
                });
            }
            
            if (!['immediate', 'rolling', 'graceful'].includes(strategy)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid update strategy',
                });
            }
            
            // Start update process asynchronously
            versionManager.updateContainers({
                version,
                strategy,
                containers,
            }).catch(error => {
                console.error('Error during version update:', error);
            });
            
            res.json({
                success: true,
                message: 'Update started',
                version,
                strategy,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    /**
     * Rollback to a previous version
     */
    router.post('/versions/rollback', async (req: Request, res: Response) => {
        try {
            const { version } = req.body;
            
            if (!version) {
                return res.status(400).json({
                    success: false,
                    error: 'Version is required',
                });
            }
            
            await versionManager.rollback(version);
            
            res.json({
                success: true,
                message: `Rolled back to version ${version}`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    /**
     * Create a new version tag
     */
    router.post('/versions/tag', async (req: Request, res: Response) => {
        try {
            const { tag, description } = req.body;
            
            if (!tag) {
                return res.status(400).json({
                    success: false,
                    error: 'Tag name is required',
                });
            }
            
            await versionManager.tagVersion(tag, description);
            
            res.json({
                success: true,
                message: `Created version tag ${tag}`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    return router;
}