/**
 * Version Manager Module
 *
 * Manages versioning, updates, and rollbacks for MAGI System containers
 */
import { spawn, execSync } from 'child_process';
import { execPromise } from '../utils/docker_commands';
import { Server } from 'socket.io';
import { ProcessManager } from './process_manager';
import { stopDockerContainer } from './container_manager';

export interface MagiVersion {
    version: string;
    commit: string;
    tag?: string;
    date: Date;
    description?: string;
    active?: boolean;
}

export interface UpdateOptions {
    version?: string;
    strategy: 'rolling' | 'immediate' | 'graceful';
    containers?: string[]; // Specific containers to update, or all if not specified
}

export class VersionManager {
    private io: Server;
    private processManager: ProcessManager;
    private currentVersion: string;
    private versionHistory: MagiVersion[] = [];

    constructor(io: Server, processManager: ProcessManager) {
        this.io = io;
        this.processManager = processManager;
        this.currentVersion = this.getCurrentVersion();
        this.loadVersionHistory();
    }

    /**
     * Get current version from git
     */
    private getCurrentVersion(): string {
        try {
            // Try to get version from git tag first
            const tag = execSync('git describe --tags --abbrev=0 2>/dev/null', {
                encoding: 'utf8',
            }).trim();
            
            if (tag) {
                return tag;
            }
        } catch {
            // If no tags, use commit hash
        }
        
        // Fall back to commit hash
        return execSync('git rev-parse --short HEAD', {
            encoding: 'utf8',
        }).trim();
    }

    /**
     * Load version history from git
     */
    private async loadVersionHistory(): Promise<void> {
        try {
            // Get all tags
            const tagsOutput = await execPromise(
                'git tag -l --sort=-version:refname --format="%(refname:short)|%(objectname:short)|%(creatordate:iso)"'
            );
            
            const tags = tagsOutput.split('\n').filter(Boolean);
            
            // Get recent commits
            const commitsOutput = await execPromise(
                'git log --pretty=format:"%h|%ci|%s" -20'
            );
            
            const commits = commitsOutput.split('\n').filter(Boolean);
            
            // Combine tags and commits into version history
            this.versionHistory = [];
            
            // Add tagged versions
            for (const tag of tags) {
                const [version, commit, date] = tag.split('|');
                this.versionHistory.push({
                    version,
                    commit,
                    tag: version,
                    date: new Date(date),
                    active: version === this.currentVersion,
                });
            }
            
            // Add recent commits
            for (const commitLine of commits) {
                const [commit, date, description] = commitLine.split('|');
                
                // Skip if already in tags
                if (!this.versionHistory.some(v => v.commit === commit)) {
                    this.versionHistory.push({
                        version: commit,
                        commit,
                        date: new Date(date),
                        description,
                        active: commit === this.currentVersion,
                    });
                }
            }
        } catch (error) {
            console.error('Error loading version history:', error);
        }
    }

    /**
     * Get available versions
     */
    async getVersions(): Promise<MagiVersion[]> {
        await this.loadVersionHistory();
        return this.versionHistory;
    }

    /**
     * Build Docker image for specific version
     */
    private async buildVersionImage(version: string): Promise<boolean> {
        try {
            // Checkout the specific version
            await execPromise(`git checkout ${version}`);
            
            // Build the Docker images
            const buildCommands = [
                'npm run build:docker',
            ];
            
            for (const cmd of buildCommands) {
                console.log(`Running: ${cmd}`);
                await execPromise(cmd);
            }
            
            // Tag the images with the version
            await execPromise(
                `docker tag magi-engine:latest magi-engine:${version}`
            );
            await execPromise(
                `docker tag magi-controller:latest magi-controller:${version}`
            );
            
            return true;
        } catch (error) {
            console.error(`Error building version ${version}:`, error);
            return false;
        } finally {
            // Return to the original branch
            await execPromise('git checkout -');
        }
    }

    /**
     * Update containers to a specific version
     */
    async updateContainers(options: UpdateOptions): Promise<void> {
        const version = options.version || this.currentVersion;
        
        // Emit update start event
        this.io.emit('version:update:start', {
            version,
            strategy: options.strategy,
            containers: options.containers,
        });
        
        try {
            // Build the version image if it doesn't exist
            const imageExists = await this.checkImageExists(version);
            if (!imageExists) {
                console.log(`Building image for version ${version}...`);
                const buildSuccess = await this.buildVersionImage(version);
                if (!buildSuccess) {
                    throw new Error(`Failed to build image for version ${version}`);
                }
            }
            
            // Get running containers
            const processes = this.processManager.getAllProcesses();
            const containersToUpdate = options.containers || Object.keys(processes);
            
            switch (options.strategy) {
                case 'immediate':
                    await this.immediateUpdate(containersToUpdate, version);
                    break;
                case 'rolling':
                    await this.rollingUpdate(containersToUpdate, version);
                    break;
                case 'graceful':
                    await this.gracefulUpdate(containersToUpdate, version);
                    break;
            }
            
            // Update current version
            this.currentVersion = version;
            await this.loadVersionHistory();
            
            // Emit update complete event
            this.io.emit('version:update:complete', {
                version,
                success: true,
            });
        } catch (error) {
            console.error('Error updating containers:', error);
            this.io.emit('version:update:error', {
                version,
                error: error.message,
            });
        }
    }

    /**
     * Check if Docker image exists for version
     */
    private async checkImageExists(version: string): Promise<boolean> {
        try {
            await execPromise(`docker inspect magi-engine:${version}`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Immediate update strategy - stop all and restart
     */
    private async immediateUpdate(
        containerIds: string[],
        version: string
    ): Promise<void> {
        const processes = this.processManager.getAllProcesses();
        
        // Stop all containers
        for (const processId of containerIds) {
            const process = processes[processId];
            if (process?.containerId) {
                await stopDockerContainer(process.containerId);
            }
        }
        
        // Update docker-compose to use new version
        await this.updateDockerComposeVersion(version);
        
        // Restart containers with new version
        // This would be handled by the process manager recreating containers
        this.io.emit('version:update:restart', {
            version,
            containers: containerIds,
        });
    }

    /**
     * Rolling update strategy - update one at a time
     */
    private async rollingUpdate(
        containerIds: string[],
        version: string
    ): Promise<void> {
        const processes = this.processManager.getAllProcesses();
        
        for (const processId of containerIds) {
            const process = processes[processId];
            if (process?.containerId) {
                // Stop the container
                await stopDockerContainer(process.containerId);
                
                // Wait a moment
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // The process manager will automatically restart with new version
                this.io.emit('version:update:container', {
                    processId,
                    version,
                });
            }
        }
    }

    /**
     * Graceful update strategy - wait for tasks to complete
     */
    private async gracefulUpdate(
        containerIds: string[],
        version: string
    ): Promise<void> {
        const processes = this.processManager.getAllProcesses();
        
        // Mark containers for graceful shutdown
        for (const processId of containerIds) {
            this.io.emit('version:update:graceful', {
                processId,
                version,
            });
        }
        
        // Wait for containers to finish their current tasks
        // This would require communication with the agents
        console.log('Waiting for agents to complete current tasks...');
        
        // Then perform rolling update
        await this.rollingUpdate(containerIds, version);
    }

    /**
     * Update docker-compose.yml to use specific version
     */
    private async updateDockerComposeVersion(version: string): Promise<void> {
        // Update the image tags in environment or config
        process.env.MAGI_VERSION = version;
        
        // Could also update docker-compose.yml directly if needed
        this.io.emit('version:config:updated', {
            version,
        });
    }

    /**
     * Rollback to a previous version
     */
    async rollback(version: string): Promise<void> {
        console.log(`Rolling back to version ${version}...`);
        
        // Check if version exists in history
        const versionInfo = this.versionHistory.find(v => v.version === version);
        if (!versionInfo) {
            throw new Error(`Version ${version} not found in history`);
        }
        
        // Update containers to the specified version
        await this.updateContainers({
            version,
            strategy: 'rolling',
        });
    }

    /**
     * Get current active version
     */
    getCurrentActiveVersion(): MagiVersion | undefined {
        return this.versionHistory.find(v => v.active);
    }

    /**
     * Create a new version tag
     */
    async tagVersion(tag: string, description?: string): Promise<void> {
        try {
            // Create git tag
            const message = description || `MAGI version ${tag}`;
            await execPromise(`git tag -a ${tag} -m "${message}"`);
            
            // Reload version history
            await this.loadVersionHistory();
            
            console.log(`Created version tag: ${tag}`);
        } catch (error) {
            console.error('Error creating version tag:', error);
            throw error;
        }
    }
}