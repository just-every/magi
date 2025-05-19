/**
 * Server Manager Module
 *
 * Handles server initialization, routing and WebSocket connections
 */
import express from 'express';
import Docker from 'dockerode';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import path from 'path';
import WebSocket from 'ws';
import { exec } from 'child_process';
import { bootstrapProjectsOnce } from '../utils/bootstrap';
import { PREventsManager } from './pr_events_manager';
import {
    ProcessCommandEvent,
    ServerInfoEvent,
    AppSettings,
} from '../../types/index';
import {
    getServerVersion,
    loadAllEnvVars,
    saveEnvVar,
    updateServerVersion,
} from './env_store';
import { ProcessManager } from './process_manager';
import { execPromise } from '../utils/docker_commands';
import { cleanupAllContainers } from './container_manager';
import { saveUsedColors } from './color_manager';
import { CommunicationManager } from './communication_manager';
import {
    setCommunicationManager,
    setAudioEnabled,
    setTelegramEnabled,
} from '../utils/talk';
import { initTelegramBot, closeTelegramBot } from '../utils/telegram_bot';
import { loadAppSettings, saveAppSettings } from '../utils/storage';
import { openUI } from '../utils/cdp';

const docker = new Docker();

// Define common content types mapping
const extensionToContentType: Record<string, string> = {
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',

    // Documents
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.xml': 'application/xml',

    // Web
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.jsx': 'application/javascript',
    '.ts': 'application/typescript',
    '.tsx': 'application/typescript',
    '.map': 'application/json',

    // Fonts
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',

    // Audio/Video
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',

    // Archives
    '.zip': 'application/zip',
    '.gz': 'application/gzip',

    // Data formats
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
};

// Extract content type from file extension
const getContentType = (filePath: string): string | undefined => {
    const ext = path.extname(filePath).toLowerCase();
    return extensionToContentType[ext];
};

export class ServerManager {
    private app = express();

    /**
     * Get the Express application instance
     * Used to register additional routes
     */
    getExpressApp(): express.Application {
        return this.app;
    }
    private server = http.createServer(this.app);
    private io = new SocketIOServer(this.server);
    private wss = new WebSocket.Server({ noServer: true });
    private liveReloadClients = new Set<WebSocket>();
    private processManager: ProcessManager;
    private communicationManager: CommunicationManager;
    private prEventsManager: PREventsManager;
    private bootstrapRan = false;

    /**
     * Get the process manager instance
     */
    getProcessManager(): ProcessManager {
        return this.processManager;
    }

    /**
     * Get the PR events manager instance
     */
    getPrEventsManager(): PREventsManager {
        return this.prEventsManager;
    }
    private cleanupInProgress = false;
    private isSystemPaused = false;
    private uiMode: 'column' | 'canvas' = 'column';
    private isAudioEnabled = true;
    private isTelegramEnabled = true;

    constructor() {
        this.processManager = new ProcessManager(this.io);

        // Initialize the communication manager before setting up WebSockets
        this.communicationManager = new CommunicationManager(
            this.server,
            this.processManager
        );

        // Initialize the PR events manager
        this.prEventsManager = new PREventsManager(this.io);

        // Connect the PR events manager to the process manager
        this.processManager.setPrEventsManager(this.prEventsManager);

        // Load persisted app settings if available
        const settings = loadAppSettings();
        this.uiMode = settings.uiMode;
        this.isAudioEnabled = settings.isAudioEnabled;
        this.isTelegramEnabled = settings.isTelegramEnabled;

        // Initialize the talk module with the communication manager
        setCommunicationManager(this.communicationManager);

        // Apply persisted settings
        setAudioEnabled(this.isAudioEnabled);
        setTelegramEnabled(this.isTelegramEnabled);

        // Initialize the Telegram bot
        initTelegramBot(this.communicationManager, this.processManager).catch(
            error => {
                console.error('Failed to initialize Telegram bot:', error);
            }
        );

        this.setupWebSockets();
        this.setupSignalHandlers();
    }

    /**
     * Start the server and handle container reconnection
     */
    async start(): Promise<void> {
        // Load stored environment variables
        loadAllEnvVars();
        updateServerVersion();

        // Initialize the server asynchronously
        await this.setupServer();
        this.setupRoutes();

        // Get port from environment or use 3001
        const isNodemonRestart = process.env.HAS_RESTARTED === 'true';
        if (!isNodemonRestart) {
            saveEnvVar('HAS_RESTARTED', 'true');
        }
        const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3010;
        console.log(
            `Starting MAGI System Server (port: ${PORT}, restart: ${isNodemonRestart})`
        );

        // If this is a restart, retrieve running MAGI containers
        if (isNodemonRestart) {
            try {
                await this.processManager.retrieveExistingContainers();
            } catch (error) {
                console.error('Failed to retrieve existing containers:', error);
            }
        }

        try {
            // Only find an available port on first start, otherwise use the configured port
            const port = isNodemonRestart
                ? PORT
                : await this.findAvailablePort(PORT);
            if (port !== PORT) {
                saveEnvVar('PORT', port.toString());
                // Update the current process environment as well
                process.env.PORT = port.toString();
                console.log(
                    `Port has changed to ${port}, updating environment`
                );
            }

            // Handle server errors
            this.server.on('error', (err: unknown) => {
                if (
                    err &&
                    typeof err === 'object' &&
                    'code' in err &&
                    err.code === 'EADDRINUSE'
                ) {
                    console.error(
                        `Port ${port} is in use despite port check. Trying a random port...`
                    );
                    const randomPort = 8000 + Math.floor(Math.random() * 1000);

                    // Update the PORT in both storage and current process environment
                    saveEnvVar('PORT', randomPort.toString());
                    process.env.PORT = randomPort.toString();
                    console.log(
                        `Port has changed to ${randomPort}, updating environment`
                    );

                    this.server.listen(randomPort);
                } else {
                    console.error('Server error:', err);
                    process.exit(1);
                }
            });

            // Start the server
            this.server.listen(port, async () => {
                const address = this.server.address();
                if (!address || typeof address === 'string') {
                    console.error('Invalid server address');
                    return;
                }

                const listeningPort = address.port;

                // Make sure our environment reflects the actual port used
                if (listeningPort.toString() !== process.env.PORT) {
                    process.env.PORT = listeningPort.toString();
                    saveEnvVar('PORT', listeningPort.toString());
                    console.log(
                        `Final port determined to be ${listeningPort}, updating environment`
                    );

                    // If this is a port change, make sure connections are handled properly
                    if (isNodemonRestart) {
                        console.log(
                            `Port changed during restart. New containers will use port ${listeningPort}. Existing containers will update on reconnection.`
                        );
                    }
                }

                const url = `http://localhost:${listeningPort}`;
                await openUI(url);

                console.log(`
┌────────────────────────────────────────────────┐
│                                                │
│  MAGI System Server is Running!                │
│                                                │
│  • Local:    ${url.padEnd(33)} │
│                                                │
└────────────────────────────────────────────────┘
		`);
            });
        } catch (error: unknown) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    /**
     * Find an available port starting from a given port
     */
    private async findAvailablePort(startPort: number): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();
            server.listen(startPort, () => {
                server.close(() => resolve(startPort));
            });
            server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(
                        `Port ${startPort} is in use, trying next port...`
                    );
                    resolve(this.findAvailablePort(startPort + 1)); // Recursively try next port
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Set up the Express server
     */
    private async setupServer(): Promise<void> {
        // Set up Docker volume access for magi_output
        await this.setupDockerVolumeAccess();

        // 2. Serve compiled JavaScript files from dist/src
        this.app.use('/client.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.sendFile(path.join(__dirname, '../../client.js'));
        });

        // 3. Serve images from the img directory
        this.app.use(
            '/img',
            express.static(path.join(__dirname, '../../client/img'), {
                setHeaders: (res, filePath) => {
                    const contentType = getContentType(filePath);
                    if (contentType) {
                        res.setHeader('Content-Type', contentType);
                    }
                },
            })
        );

        // 4. Serve static files from the dist folder
        this.app.use(express.static(path.join(__dirname, '../..')));

        // 5. Ensure the root route returns the index.html
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../client/html/index.html'));
        });
    }

    /**
     * Set up Docker volume file access for magi_output
     * This creates a persistent helper container to access the volume
     */
    private async setupDockerVolumeAccess(): Promise<void> {
        const HELPER_CONTAINER_NAME = 'magi-file-server';
        const fileCache = new Map<string, boolean>();

        // Define helper functions at the root level of setupDockerVolumeAccess
        const serveFileFromDocker = async (
            req: express.Request,
            res: express.Response
        ): Promise<void> => {
            // Debug logging for file requests
            const startTime = Date.now();
            try {
                const filePath = req.path || '';
                const cleanPath = filePath.replace(/^\/+/, '');

                if (cleanPath.includes('..')) {
                    res.status(403).send('Access denied');
                    return;
                }

                // Check cache first
                if (!fileCache.has(cleanPath)) {
                    // File not in cache, attempt to serve it
                    const container = docker.getContainer(
                        HELPER_CONTAINER_NAME
                    );
                    const fileServed = await getAndServeFile(
                        container,
                        cleanPath,
                        res,
                        startTime
                    );

                    if (fileServed) {
                        fileCache.set(cleanPath, true);
                    }
                    const duration = Date.now() - startTime;
                    if (duration > 500) {
                        // Log only slow requests
                        console.log(
                            `[DEBUG] File access slow (${duration}ms): ${cleanPath}`
                        );
                    }
                    return; // Response has already been sent
                }

                // File is in cache, serve it directly
                const container = docker.getContainer(HELPER_CONTAINER_NAME);
                await getAndServeFile(container, cleanPath, res, startTime);
            } catch (error) {
                console.error('Error serving file from Docker volume:', error);
                if (!res.headersSent) {
                    res.status(500).send('Error accessing file');
                }
            }
        };

        // Using the global content type utilities

        // Set appropriate content type header based on file extension
        const setContentTypeHeader = (
            res: express.Response,
            filePath: string
        ): void => {
            const contentType = getContentType(filePath);
            if (contentType) {
                res.setHeader('Content-Type', contentType);
            }
        };

        // Get and serve file content in one operation
        const getAndServeFile = async (
            container: Docker.Container,
            cleanPath: string,
            res: express.Response,
            startTime: number
        ): Promise<boolean> => {
            const exec = await container.exec({
                Cmd: ['cat', `/magi_output/${cleanPath}`],
                AttachStdout: true,
                AttachStderr: true,
            });

            const stream = await exec.start({});

            return new Promise<boolean>(resolve => {
                const chunks: Buffer[] = [];

                stream.on('data', (chunk: Buffer) => chunks.push(chunk));

                stream.on('error', (err: Error) => {
                    console.error('Stream error:', err);
                    if (!res.headersSent) {
                        res.status(500).send('Error reading file');
                    }
                    resolve(false);
                });

                stream.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        if (buffer.length <= 8) {
                            if (!res.headersSent) {
                                res.status(404).send('File not found or empty');
                            }
                            resolve(false);
                            return;
                        }

                        // Check if there was an error (indicating file not found)
                        const inspect = await exec.inspect();
                        if (inspect.ExitCode !== 0) {
                            if (!res.headersSent) {
                                res.status(404).send('File not found');
                            }
                            resolve(false);
                            return;
                        }

                        const fileContent = extractDockerStreamContent(buffer);

                        // Only set content type header when we know we're serving the file
                        setContentTypeHeader(res, cleanPath);

                        res.send(fileContent);
                        const duration = Date.now() - startTime;
                        if (duration > 500) {
                            // Log only slow requests
                            console.log(
                                `[DEBUG] File access slow (${duration}ms): ${cleanPath}, size: ${fileContent.length} bytes`
                            );
                        }
                        resolve(true);
                    } catch (err) {
                        console.error('Error processing file content:', err);
                        if (!res.headersSent) {
                            res.status(500).send('Error processing file');
                        }
                        resolve(false);
                    }
                });
            });
        };

        // Extract actual content from Docker stream (skipping frame headers)
        const extractDockerStreamContent = (buffer: Buffer): Buffer => {
            let fileContent = Buffer.alloc(0);
            let offset = 0;

            while (offset < buffer.length) {
                // Skip the 8-byte header
                const payloadSize = buffer.readUInt32BE(offset + 4);
                if (offset + 8 + payloadSize <= buffer.length) {
                    const payload = buffer.slice(
                        offset + 8,
                        offset + 8 + payloadSize
                    );
                    fileContent = Buffer.concat([fileContent, payload]);
                }
                offset += 8 + payloadSize;
            }

            return fileContent;
        };

        try {
            // Check if container already exists
            const containers = await docker.listContainers({
                all: true,
                filters: { name: [HELPER_CONTAINER_NAME] },
            });

            if (containers.length > 0) {
                const container = docker.getContainer(HELPER_CONTAINER_NAME);
                const info = await container.inspect();

                // Start if not running
                if (!info.State.Running) {
                    await container.start();
                }
            } else {
                // Create a new lightweight container that stays running
                await docker
                    .createContainer({
                        Image: 'alpine',
                        name: HELPER_CONTAINER_NAME,
                        Cmd: ['tail', '-f', '/dev/null'], // Keep container running
                        Tty: true,
                        Volumes: { '/magi_output': {} },
                        HostConfig: {
                            Binds: ['magi_output:/magi_output'],
                            AutoRemove: false,
                        },
                    })
                    .then(container => container.start());
            }

            // Set up middleware for serving files from Docker volume
            this.app.use('/magi_output', (req, res, next) => {
                serveFileFromDocker(req, res).catch(next);
            });
        } catch (error) {
            console.error('Failed to set up Docker volume access:', error);
            // Fall back to direct mount approach if Docker API fails
            this.app.use(
                '/magi_output',
                express.static('/magi_output', {
                    setHeaders: (res, filePath) => {
                        const contentType = getContentType(filePath);
                        if (contentType) {
                            res.setHeader('Content-Type', contentType);
                        }
                    },
                })
            );
        }
    }

    /**
     * Set up WebSocket handlers for Socket.io and live reload
     */
    private setupWebSockets(): void {
        // Set up WebSocket server for live reload
        this.wss.on('connection', ws => {
            this.liveReloadClients.add(ws);

            ws.on('close', () => {
                this.liveReloadClients.delete(ws);
            });
        });

        // Handle upgrade for the WebSocket connection
        this.server.on('upgrade', (request, socket, head) => {
            const pathname = new URL(
                request.url || '',
                `http://${request.headers.host}`
            ).pathname;

            if (pathname === '/livereload') {
                this.wss.handleUpgrade(request, socket, head, ws => {
                    this.wss.emit('connection', ws, request);
                });
            } else if (pathname.startsWith('/ws/magi/')) {
                // Pass the upgrade request to the CommunicationManager's WebSocket server
                this.communicationManager.handleWebSocketUpgrade(
                    request,
                    socket,
                    head
                );
            } else {
                socket.destroy();
            }
        });

        // Set up Socket.io connection handlers
        this.io.on('connection', this.handleSocketConnection.bind(this));
    }

    /**
     * Set up Express routes
     */
    private setupRoutes(): void {
        // Set up API route for all processes and their data
        this.app.get('/api/processes', (req, res) => {
            try {
                // Get all processes data from the communication manager
                const processesData =
                    this.communicationManager.getAllProcessesData();

                res.json({
                    success: true,
                    data: processesData,
                });
            } catch (error) {
                console.error('Error handling processes data request:', error);
                res.status(500).json({
                    error: 'Server error',
                    details: String(error),
                });
            }
        });

        // Set up API route for LLM logs list
        this.app.get('/api/llm-logs/:processId', (req, res) => {
            try {
                const processId = req.params.processId;
                const containerName = `magi-${processId}`;

                // Get Docker logs
                exec(
                    `docker exec ${containerName} node -e "const fs = require('fs'); const path = require('path'); const dir = '/magi_output/${processId}/logs/llm'; if (fs.existsSync(dir)) { const logs = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); console.log(JSON.stringify(logs)); } else { console.log('[]'); }"`,
                    (err, stdout) => {
                        if (err) {
                            console.error(
                                `Error getting LLM logs for ${processId}:`,
                                err
                            );
                            res.status(500).json({
                                error: 'Error retrieving logs',
                                details: String(err),
                            });
                            return;
                        }

                        // Parse the list of log files
                        let logFiles;
                        try {
                            logFiles = JSON.parse(stdout.trim());
                        } catch (parseErr) {
                            console.error(
                                'Error parsing log files list:',
                                parseErr
                            );
                            res.status(500).json({
                                error: 'Error parsing log files',
                                details: String(parseErr),
                            });
                            return;
                        }

                        res.json({
                            processId,
                            logFiles,
                        });
                    }
                );
            } catch (error) {
                console.error('Error handling LLM logs request:', error);
                res.status(500).json({
                    error: 'Server error',
                    details: String(error),
                });
            }
        });

        // Set up API route for LLM logs filtered by agent_id
        this.app.get('/api/llm-logs/:processId/:agentId', (req, res, next) => {
            try {
                const processId = req.params.processId;
                const agentId = req.params.agentId;

                // Check if this is actually a log file request (for backward compatibility)
                if (agentId.endsWith('.json')) {
                    // Let the next route handler take care of this request
                    return next();
                }

                const containerName = `magi-${processId}`;

                // Get Docker logs with agent filtering
                exec(
                    `docker exec ${containerName} node -e "const fs = require('fs'); const path = require('path'); const dir = '/magi_output/${processId}/logs/llm'; if (fs.existsSync(dir)) { const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); const agentLogs = []; for (const file of files) { try { const content = fs.readFileSync(path.join(dir, file), 'utf8'); const log = JSON.parse(content); if (log.agent_id === '${agentId}') { agentLogs.push(file); } } catch (e) {} } console.log(JSON.stringify(agentLogs.sort())); } else { console.log('[]'); }"`,
                    (err, stdout) => {
                        if (err) {
                            console.error(
                                `Error getting LLM logs for ${processId}/${agentId}:`,
                                err
                            );
                            res.status(500).json({
                                error: 'Error retrieving logs',
                                details: String(err),
                            });
                            return;
                        }

                        // Parse the list of log files
                        let logFiles;
                        try {
                            logFiles = JSON.parse(stdout.trim());
                        } catch (parseErr) {
                            console.error(
                                'Error parsing log files list:',
                                parseErr
                            );
                            res.status(500).json({
                                error: 'Error parsing log files',
                                details: String(parseErr),
                            });
                            return;
                        }

                        res.json({
                            processId,
                            agentId,
                            logFiles,
                        });
                    }
                );
            } catch (error) {
                console.error(
                    'Error handling LLM logs by agent request:',
                    error
                );
                res.status(500).json({
                    error: 'Server error',
                    details: String(error),
                });
            }
        });

        // Set up API route to get a specific log file
        this.app.get('/api/llm-logs/:processId/:logFile', (req, res) => {
            try {
                const processId = req.params.processId;
                const logFile = req.params.logFile;
                const containerName = `magi-${processId}`;

                // Validate log file name to prevent injection
                if (!logFile.match(/^[\w-.]+\.json$/)) {
                    res.status(400).json({ error: 'Invalid log file name' });
                    return;
                }

                // Get log file content from Docker container
                exec(
                    `docker exec ${containerName} cat /magi_output/${processId}/logs/llm/${logFile}`,
                    { maxBuffer: 1024 * 1024 * 100 }, // 100 MB buffer limit
                    (err, stdout) => {
                        if (err) {
                            console.error(
                                `Error getting log file ${logFile} for ${processId}:`,
                                err
                            );
                            res.status(500).json({
                                error: 'Error retrieving log file',
                                details: String(err),
                            });
                            return;
                        }

                        // Parse the log file content as JSON
                        let logContent;
                        try {
                            logContent = JSON.parse(stdout.trim());
                            res.json(logContent);
                        } catch (parseErr) {
                            console.error(
                                'Error parsing log file content:',
                                parseErr
                            );
                            res.status(500).json({
                                error: 'Error parsing log file content',
                                details: String(parseErr),
                            });
                        }
                    }
                );
            } catch (error) {
                console.error('Error handling log file request:', error);
                res.status(500).json({
                    error: 'Server error',
                    details: String(error),
                });
            }
        });

        // Set up API route to get cost tracking data
        this.app.get('/api/cost-tracker/:processId', (req, res) => {
            try {
                const processId = req.params.processId;
                const containerName = `magi-${processId}`;

                // Get cost tracker data from Docker container
                exec(
                    `docker exec ${containerName} node -e "const { costTracker } = require('./dist/utils/cost_tracker.js'); console.log(JSON.stringify({ total: costTracker.getTotalCost(), byModel: costTracker.getCostsByModel() }))"`,
                    (err, stdout) => {
                        if (err) {
                            console.error(
                                `Error getting cost tracker data for ${processId}:`,
                                err
                            );
                            res.status(500).json({
                                error: 'Error retrieving cost data',
                                details: String(err),
                            });
                            return;
                        }

                        // Parse the cost tracker data
                        let costData;
                        try {
                            costData = JSON.parse(stdout.trim());
                            res.json(costData);
                        } catch (parseErr) {
                            console.error(
                                'Error parsing cost tracker data:',
                                parseErr
                            );
                            res.status(500).json({
                                error: 'Error parsing cost tracker data',
                                details: String(parseErr),
                            });
                        }
                    }
                );
            } catch (error) {
                console.error('Error handling cost tracker request:', error);
                res.status(500).json({
                    error: 'Server error',
                    details: String(error),
                });
            }
        });

        // Set up API route to get Docker container logs
        this.app.get('/api/docker-logs/:processId', (req, res) => {
            try {
                const processId = req.params.processId;
                const containerName = `magi-${processId}`;
                const lines = req.query.lines
                    ? parseInt(req.query.lines as string)
                    : 1000;

                // Get Docker container logs
                exec(
                    `docker logs --tail=${lines} ${containerName}`,
                    (err, stdout) => {
                        if (err) {
                            console.error(
                                `Error getting Docker logs for ${processId}:`,
                                err
                            );
                            res.status(500).json({
                                error: 'Error retrieving Docker logs',
                                details: String(err),
                            });
                            return;
                        }

                        res.json({
                            processId,
                            logs: stdout.split('\n'),
                        });
                    }
                );
            } catch (error) {
                console.error('Error handling Docker logs request:', error);
                res.status(500).json({
                    error: 'Server error',
                    details: String(error),
                });
            }
        });

        // Exclude /magi_output and /api paths from the catch-all route
        this.app.get('*', (req, res, next) => {
            // Check if the request path starts with /magi_output or /api
            if (
                req.path.startsWith('/magi_output/') ||
                req.path.startsWith('/api/')
            ) {
                // Skip to the next middleware
                return next();
            }

            // For all other routes, serve the index.html for client-side routing
            res.sendFile(path.join(__dirname, '../../client/html/index.html'));
        });
    }

    /**
     * Set up signal handlers for graceful shutdown
     */
    private setupSignalHandlers(): void {
        // Register cleanup handlers for various termination signals
        process.on('SIGINT', this.handleTerminationSignal.bind(this));
        process.on('SIGTERM', this.handleTerminationSignal.bind(this));

        // Also handle uncaught exceptions and unhandled promise rejections
        process.on('uncaughtException', err => {
            console.error('Uncaught exception:', err);
            this.handleTerminationSignal().catch(error => {
                console.error(
                    'Error during cleanup after uncaught exception:',
                    error
                );
                process.exit(1);
            });
        });

        process.on('unhandledRejection', reason => {
            console.error('Unhandled promise rejection:', reason);
            // Don't exit the process, just log the error
        });

        // Handle nodemon restarts by cleaning up containers
        if (process.env.NODE_ENV === 'development') {
            process.on('SIGUSR2', async () => {
                console.log('Received SIGUSR2 (nodemon restart)');

                if (typeof closeTelegramBot === 'function') {
                    try {
                        console.log(
                            'Closing Telegram bot before nodemon restart...'
                        );
                        closeTelegramBot().catch(e =>
                            console.error('Error during Telegram shutdown:', e)
                        );
                    } catch (error) {
                        console.error(
                            'Error closing Telegram bot during nodemon restart:',
                            error
                        );
                    }
                }
                // Don't do a full cleanup since we're just restarting
                // But make sure containers keep running
            });
        }
    }

    /**
     * Handle SIGINT and SIGTERM signals for graceful shutdown
     */
    private async handleTerminationSignal(): Promise<void> {
        // If we're already cleaning up, don't do it again
        if (this.cleanupInProgress) {
            console.log(
                'Already shutting down, ignoring additional termination signal'
            );
            return;
        }

        this.cleanupInProgress = true;
        console.log('Shutting down MAGI System...');

        // Try to close Telegram bot
        try {
            console.log('Closing Telegram bot...');
            await closeTelegramBot();
        } catch (error) {
            console.error('Error closing Telegram bot:', error);
        }

        // Attempt to clean up all containers
        try {
            console.log('Cleaning up all containers...');
            await cleanupAllContainers();
            const { stdout } = await execPromise(
                'docker ps -a --filter "name=magi-" --format "{{.Names}}"'
            );
            if (stdout.trim()) {
                console.log('Remaining containers:', stdout);
            } else {
                console.log('All containers successfully removed');
            }
        } catch (error) {
            console.error('Error cleaning up containers:', error);
        }

        // Save preferences and settings
        try {
            // Save current color assignments
            saveUsedColors();
        } catch (error) {
            console.error('Error saving preferences:', error);
        }

        console.log('Shutdown complete');
        process.exit(0);
    }

    /**
     * Handle Socket.io connection
     *
     * @param socket - The connected socket
     */
    private handleSocketConnection(socket: Socket): void {
        const clientId = socket.id.substring(0, 8);
        console.log(`Client connected: ${clientId}`);

        // Send server info to the client
        socket.emit('server:info', {
            version: getServerVersion(),
        } as ServerInfoEvent);

        // Send current states to new clients
        socket.emit('pause_state_update', this.isSystemPaused);
        socket.emit('uimode_state_update', this.uiMode);
        socket.emit('audio_state_update', this.isAudioEnabled);
        socket.emit('telegram_state_update', this.isTelegramEnabled);

        // Send full app settings to the client
        const currentSettings = loadAppSettings();
        socket.emit('app_settings_update', currentSettings);

        // Clean up terminated processes
        this.processManager.cleanupTerminatedProcesses();

        // Send current processes to the new client (excluding terminated)
        const processes = this.processManager.getAllProcesses();
        Object.entries(processes).forEach(([id, process]) => {
            console.log(
                `Sending process ${id} state to new client ${clientId}`
            );

            // First send the process creation event
            socket.emit('process:create', {
                id,
                command: process.command,
                status: process.status,
                colors: process.colors,
                name:
                    process.agentProcess?.name ||
                    (id === this.processManager.coreProcessId
                        ? global.process.env.AI_NAME
                        : id),
            });

            // Then retrieve and send the structured message history for this process
            const messageHistory =
                this.communicationManager.getMessageHistory(id);
            if (messageHistory.length > 0) {
                console.log(
                    `Sending ${messageHistory.length} message history events for process ${id}`
                );
                // Send each structured message to rebuild the UI state
                messageHistory.forEach(historicalMessage => {
                    socket.emit('process:message', {
                        id,
                        message: historicalMessage,
                    });
                });
            }

            // Also send raw logs for compatibility
            if (process.logs.length > 0) {
                socket.emit('process:logs', {
                    id,
                    logs: process.logs.join('\n'),
                });
            }
        });

        // Send the latest cost data to the new client
        const latestCostData =
            this.communicationManager.getLatestGlobalCostData();
        socket.emit('cost:info', latestCostData);

        // Handle command:run event
        socket.on('command:run', (command: string) => {
            const clientId = socket.id.substring(0, 8);
            console.log(
                `Client ${clientId} sent command:run event: "${command}"`
            );
            this.handleCommandRun(command);
        });

        // Handle process:terminate event
        socket.on('process:terminate', async (processId: string) => {
            console.log(
                `Client ${clientId} requested termination of process ${processId}`
            );
            await this.handleProcessTerminate(socket, processId);
        });

        // Handle process:command event
        socket.on('process:command', async (data: ProcessCommandEvent) => {
            console.log(
                `Client ${clientId} sent command to process ${data.processId}: ${data.command}`
            );
            await this.handleProcessCommand(socket, data);
        });

        // Handle set_pause_state event
        socket.on('set_pause_state', (pauseState: boolean) => {
            console.log(
                `Client ${clientId} set system pause state to: ${pauseState}`
            );
            this.handleSetPauseState(pauseState);
        });

        // Handle set_uimode_state event
        socket.on('set_uimode_state', (uimode: 'column' | 'canvas') => {
            console.log(`Client ${clientId} set uimode to: ${uimode}`);
            this.handleSetUIModeState(uimode);
        });

        // Handle set_audio_state event
        socket.on('set_audio_state', (audioState: boolean) => {
            console.log(`Client ${clientId} set audio state to: ${audioState}`);
            this.handleSetAudioState(audioState);
        });

        // Handle set_telegram_state event
        socket.on('set_telegram_state', (telegramState: boolean) => {
            console.log(
                `Client ${clientId} set telegram state to: ${telegramState}`
            );
            this.handleSetTelegramState(telegramState);
        });

        // Handle update_app_settings event
        socket.on('update_app_settings', (settings: AppSettings) => {
            console.log(
                `Client ${clientId} sent app settings update:`,
                settings
            );
            this.handleUpdateAppSettings(settings);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${clientId}`);
            // Note: We don't stop any processes when a client disconnects,
            // as other clients may still be monitoring them
        });
    }

    /**
     * Handle command:run event
     *
     * @param command - The command to run
     */
    async handleCommandRun(command: string): Promise<void> {
        // Validate command string
        if (!command || typeof command !== 'string' || !command.trim()) {
            console.error('Invalid command received:', command);
            return;
        }

        // Generate a unique process ID
        const processId = `AI-${Math.random().toString(36).substring(2, 8)}`;

        // Create a new process
        await this.processManager.createProcess(processId, command);

        // Run bootstrap for projects on first command
        if (!this.bootstrapRan) {
            this.bootstrapRan = true;
            console.log('First command received, bootstrapping projects...');
            try {
                await bootstrapProjectsOnce(this.processManager);
            } catch (err) {
                console.error('Failed to bootstrap projects:', err);
            }
        }
    }

    /**
     * Handle process:terminate event
     *
     * @param socket - The socket that sent the event
     * @param processId - The ID of the process to terminate
     */
    private async handleProcessTerminate(
        socket: Socket,
        processId: string
    ): Promise<void> {
        // Verify the process exists
        const process = this.processManager.getProcess(processId);
        if (!process) {
            console.warn(
                `Process ${processId} does not exist, can't terminate`
            );
            socket.emit('process:logs', {
                id: processId,
                logs: '[ERROR] Process does not exist or has already terminated',
            });
            return;
        }

        // First try to terminate using WebSocket if available
        if (this.communicationManager.hasActiveConnection(processId)) {
            // Try graceful shutdown via WebSocket first
            console.log(
                `Attempting graceful termination of ${processId} via WebSocket`
            );
            const wsSuccess = this.communicationManager.stopProcess(processId);

            if (wsSuccess) {
                console.log(
                    `Process ${processId} gracefully terminating via WebSocket`
                );
                this.processManager.updateProcess(
                    processId,
                    '[INFO] Gracefully shutting down...'
                );

                // Give it a moment to shut down cleanly before forcing
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Forcefully stop the container in case graceful shutdown fails or isn't available
        console.log(`Forcefully stopping container for process ${processId}`);
        const success = await this.processManager.stopProcess(processId);

        if (!success) {
            console.error(`Failed to terminate process ${processId}`);
            socket.emit('process:logs', {
                id: processId,
                logs: '[ERROR] Failed to terminate process',
            });
        }
    }

    /**
     * Handle process:command event
     *
     * @param socket - The socket that sent the event
     * @param data - The command data
     */
    private async handleProcessCommand(
        socket: Socket,
        data: ProcessCommandEvent
    ): Promise<void> {
        const { processId, command, sourceProcessId } = data;

        // Verify the process exists and is running
        const process = this.processManager.getProcess(processId);
        if (!process) {
            console.warn(
                `Cannot send command: Process ${processId} does not exist`
            );
            socket.emit('process:logs', {
                id: processId,
                logs: '[ERROR] Process does not exist or has terminated',
            });
            return;
        }

        if (process.status !== 'running') {
            console.warn(
                `Cannot send command: Process ${processId} is not running (status: ${process.status})`
            );
            socket.emit('process:logs', {
                id: processId,
                logs: `[ERROR] Cannot send command: process is not running (status: ${process.status})`,
            });
            return;
        }

        // Try WebSocket communication first
        let success = false;
        if (this.communicationManager.hasActiveConnection(processId)) {
            success = this.communicationManager.sendCommand(
                processId,
                command,
                {},
                sourceProcessId
            );

            if (success) {
                console.log(
                    `Command sent to process ${processId} successfully via WebSocket${sourceProcessId ? ` from process ${sourceProcessId}` : ''}`
                );
                this.processManager.updateProcess(
                    processId,
                    '[INFO] Command sent via WebSocket'
                );
                return;
            }
        }

        // If WebSocket fails, fall back to other means of communication
        console.warn(
            `Failed to send command to process ${processId} via WebSocket`
        );
        socket.emit('process:logs', {
            id: processId,
            logs: '[WARNING] Failed to send command via WebSocket',
        });
    }

    /**
     * Handle set_pause_state event
     */
    private handleSetPauseState(pauseState: boolean): void {
        // Update the system pause state
        this.isSystemPaused = pauseState;
        console.log(
            `System pause state updated to: ${pauseState ? 'PAUSED' : 'RESUMED'}`
        );

        // Broadcast to all clients
        this.io.emit('pause_state_update', this.isSystemPaused);

        // Broadcast to all processes
        const processes = this.processManager.getAllProcesses();
        for (const processId of Object.keys(processes)) {
            this.communicationManager.setPauseState(processId, pauseState);
            console.log(
                `Sent ${pauseState ? 'pause' : 'resume'} command to process ${processId}`
            );
        }
    }

    /**
     * Handle uimode_state_update event
     */
    private handleSetUIModeState(uiMode: 'canvas' | 'column'): void {
        // Update local state
        this.uiMode = uiMode;

        // Notify all clients
        this.io.emit('uimode_state_update', this.uiMode);

        // Save to persistent storage
        saveAppSettings({
            uiMode: uiMode, // Keep the current UI mode
            isAudioEnabled: this.isAudioEnabled,
            isTelegramEnabled: this.isTelegramEnabled,
        });
    }

    /**
     * Handle set_audio_state event
     */
    private handleSetAudioState(audioState: boolean): void {
        // Update local state
        this.isAudioEnabled = audioState;
        setAudioEnabled(audioState);
        console.log(
            `System audio state updated to: ${audioState ? 'ENABLED' : 'DISABLED'}`
        );

        // Notify all clients
        this.io.emit('audio_state_update', this.isAudioEnabled);

        // Save to persistent storage
        saveAppSettings({
            uiMode: this.uiMode,
            isAudioEnabled: audioState,
            isTelegramEnabled: this.isTelegramEnabled,
        });
    }

    /**
     * Handle set_telegram_state event
     */
    private handleSetTelegramState(telegramState: boolean): void {
        // Update local state
        this.isTelegramEnabled = telegramState;
        setTelegramEnabled(telegramState);
        console.log(
            `System telegram state updated to: ${telegramState ? 'ENABLED' : 'DISABLED'}`
        );

        // Notify all clients
        this.io.emit('telegram_state_update', this.isTelegramEnabled);

        // Save to persistent storage
        saveAppSettings({
            uiMode: this.uiMode,
            isAudioEnabled: this.isAudioEnabled,
            isTelegramEnabled: telegramState,
        });
    }

    /**
     * Handle update_app_settings event - save and apply all settings at once
     */
    private handleUpdateAppSettings(settings: AppSettings): void {
        console.log('Updating app settings:', settings);

        // Update audio state if it changed
        if (settings.uiMode !== this.uiMode) {
            this.uiMode = settings.uiMode;
            this.io.emit('uimode_state_update', this.uiMode);
        }

        // Update audio state if it changed
        if (settings.isAudioEnabled !== this.isAudioEnabled) {
            this.isAudioEnabled = settings.isAudioEnabled;
            setAudioEnabled(settings.isAudioEnabled);
            this.io.emit('audio_state_update', this.isAudioEnabled);
        }

        // Update telegram state if it changed
        if (settings.isTelegramEnabled !== this.isTelegramEnabled) {
            this.isTelegramEnabled = settings.isTelegramEnabled;
            setTelegramEnabled(settings.isTelegramEnabled);
            this.io.emit('telegram_state_update', this.isTelegramEnabled);
        }

        // Save all settings to persistent storage
        saveAppSettings(settings);
        console.log('App settings saved to storage');
    }
}
