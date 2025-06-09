/**
 * Container Manager Module
 *
 * Higher-level container management functionality for MAGI System.
 */
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

import {
    validateContainerName,
    execPromise,
    execPromiseFallback,
} from '../utils/docker_commands';
import { ProcessToolType } from '../../types/index';
import {
    getProject,
    updateProject,
    addProjectHistory,
    getAllProjectIds,
} from '../utils/db_utils';

export interface DockerBuildOptions {
    tag?: string;
    noCache?: boolean;
    verbose?: boolean;
}

export interface DockerRunOptions {
    processId: string;
    command: string;
    tool?: ProcessToolType;
    coreProcessId?: string;
    projectIds?: string[]; // Array of git repositories to clone and mount
    projectPorts?: Record<string, string>; // Mapping of projectId -> port
}

/**
 * Build the MAGI System Docker image
 * @param options Build options
 * @returns Promise resolving to true if build was successful, false otherwise
 */
export async function buildDockerImage(
    options: DockerBuildOptions = {}
): Promise<boolean> {
    try {
        const tag = options.tag || 'latest';
        const dockerfilePath = path.resolve(
            __dirname,
            '../../../../../engine/docker/Dockerfile'
        );
        const contextPath = path.resolve(__dirname, '../../../../../');

        // Verify dockerfile exists
        if (!fs.existsSync(dockerfilePath)) {
            throw new Error(`Dockerfile not found at ${dockerfilePath}`);
        }

        // Build arguments
        const buildArgs = [
            'build',
            '-t',
            `magi-engine:${tag}`,
            '-f',
            dockerfilePath,
            contextPath,
        ];
        if (options.noCache) {
            buildArgs.push('--no-cache');
        }

        // Spawn the process
        console.log(
            `Building Docker image with command: docker ${buildArgs.join(' ')}`
        );
        const buildProcess = spawn('docker', buildArgs, {
            stdio: options.verbose ? 'inherit' : 'pipe',
        });

        // If not verbose, collect and log output
        if (!options.verbose) {
            buildProcess.stdout?.on('data', data => {
                console.log(`Docker build output: ${data.toString()}`);
            });

            buildProcess.stderr?.on('data', data => {
                console.error(`Docker build error: ${data.toString()}`);
            });
        }

        // Wait for process to complete
        return new Promise<boolean>(resolve => {
            buildProcess.on('close', code => {
                if (code === 0) {
                    console.log('Docker image built successfully');
                    resolve(true);
                } else {
                    console.error(`Docker build failed with code ${code}`);
                    resolve(false);
                }
            });
        });
    } catch (error) {
        console.error('Error building Docker image:', error);
        return false;
    }
}

/**
 * Prepare a git repository for use by a container
 *
 * @param processId The process ID
 * @param repo The repository options
 * @returns Object with temporary directory and mount path
 */
async function prepareGitRepository(
    processId: string,
    projectId: string
): Promise<{ hostPath: string; outputPath: string }> {
    console.log(`prepareGitRepository(${processId}, ${projectId})...`);

    // Where the git repository is located on the host
    const hostPath = path.join('/external/host', projectId);

    // Create a temporary directory for the git repo in the magi_output volume
    const outputPath = path.join(
        '/magi_output',
        processId,
        'projects',
        projectId
    );

    try {
        // Skip if the path doesn't exist on the host
        if (!fs.existsSync(hostPath)) {
            console.error(
                `Skipping git repository at ${hostPath} - directory does not exist`
            );
            throw new Error(
                `Skipping git repository at ${hostPath} - directory does not exist`
            );
        }

        // Check if it's a git repository
        try {
            console.log('Checking if git repository exists', hostPath);
            try {
                await execPromise(
                    `git -C "${hostPath}" rev-parse --is-inside-work-tree`
                );
            } catch (error) {
                await execPromise(
                    `git config --global --add safe.directory "${hostPath}"`
                );
                await execPromise(
                    `git config --global --add safe.directory "${hostPath}/.git"`
                );
                await execPromise(
                    `git -C "${hostPath}" rev-parse --is-inside-work-tree`
                );
            }
        } catch (error) {
            console.error(`Can not access git at ${hostPath}`);
            throw new Error(`Can not access git at ${hostPath}`);
        }

        // Remove the directory if it exists
        if (fs.existsSync(outputPath)) {
            fs.rmSync(outputPath, { recursive: true, force: true });
        }

        // Use git worktree for faster setup and shared storage
        console.log('Creating git worktree', hostPath, outputPath);

        // First, ensure the main repo has no uncommitted changes that would block worktree
        try {
            // Check if the repository has any remotes configured
            const { stdout: remotes } = await execPromise(`git -C "${hostPath}" remote`);

            if (remotes.trim()) {
                // Only fetch if there are remotes configured
                try {
                    await execPromise(`git -C "${hostPath}" fetch --all`);
                } catch (fetchError) {
                    // This is common in Docker environments without SSH keys
                    console.log('Note: Could not fetch from remote (this is normal for local repos or when SSH keys are not configured)');
                }
            }
        } catch (error) {
            console.warn('Could not check remotes, continuing without fetch:', error);
        }

        // Create a unique branch name for this process
        const branchName = `task-${processId}-${Date.now()}`;

        // Try to use worktree first (much faster and shares git objects)
        try {
            await execPromise(`git -C "${hostPath}" worktree add "${outputPath}" -b ${branchName}`);
            console.log('Successfully created git worktree');
        } catch (worktreeError) {
            // Fallback to clone if worktree fails (e.g., if branch already exists)
            console.log('Worktree failed, falling back to clone:', worktreeError);
            await execPromise(`git clone --depth 1 "${hostPath}" "${outputPath}"`);
            await execPromise(
                `git -C "${outputPath}" remote set-url origin "${hostPath}"`
            );
        }

        // Host path will be deterministically derived from projectId

        // Branch handling - only needed for clone fallback
        // (worktree already creates and checks out the branch)
        const isWorktree = await execPromiseFallback(
            `git -C "${outputPath}" rev-parse --git-dir | grep -q worktrees`
        );

        if (isWorktree.stderr) {
            // This is a clone, not a worktree - need to handle branch
            const branchExists = await execPromiseFallback(
                `git -C "${outputPath}" show-ref --verify --quiet refs/heads/${branchName}`
            );

            if (branchExists.stderr) {
                // Branch doesn't exist, create it
                await execPromise(
                    `git -C "${outputPath}" checkout -b ${branchName}`
                );
            } else {
                // Branch exists, checkout
                await execPromise(`git -C "${outputPath}" checkout ${branchName}`);
            }
        }

        // Set git config for commits
        await execPromise(`git -C "${outputPath}" config user.name "magi"`);
        await execPromise(
            `git -C "${outputPath}" config user.email "magi+${processId}@withmagi.com"`
        );

        return {
            hostPath,
            outputPath,
        };
    } catch (error) {
        console.error(`Error preparing git repository ${outputPath}`, error);
        throw new Error(
            `Error preparing git repository ${outputPath}: ${error}`
        );
    }
}

/**
 * Copy template files to a project directory
 *
 * @param projectPath The path to the project directory
 * @param projectType The type of project template to use
 * @returns Promise resolving to true if successful
 */
async function copyTemplateToProject(
    projectPath: string,
    projectType: string,
    project: any // Project object containing description information
): Promise<boolean> {
    // Template source directory
    const templatePath = `/app/templates/${projectType}`;
    const defaultTemplatePath = '/app/templates/web-app';

    // Check if the specified template exists
    const sourcePath = fs.existsSync(templatePath)
        ? templatePath
        : defaultTemplatePath;

    try {
        console.log(`Copying template from ${sourcePath} to ${projectPath}`);

        // Copy files recursively using cp -r
        await execPromise(`cp -r ${sourcePath}/* ${projectPath}/`);
        await execPromise(
            `cp -r ${sourcePath}/.* ${projectPath}/ 2>/dev/null || true`
        );

        // Replace placeholders in .md files and project_map.json
        console.log('Replacing placeholders in template files');

        // Get description values (provide defaults if not available)
        const simpleDescription =
            project?.simple_description || 'A new project';
        const detailedDescription =
            project?.detailed_description ||
            'A detailed description of the project.';

        // Find all .md files in the project root
        const files = fs.readdirSync(projectPath);
        const mdFiles = files.filter(file => file.endsWith('.md'));

        // Add project_map.json if it exists
        if (files.includes('project_map.json')) {
            mdFiles.push('project_map.json');
        }

        // Replace placeholders in each file
        for (const file of mdFiles) {
            const filePath = path.join(projectPath, file);
            try {
                // Read file content
                let content = fs.readFileSync(filePath, 'utf8');

                // Replace placeholders
                content = content.replace(
                    /\[simple_description\]/g,
                    simpleDescription
                );
                content = content.replace(
                    /\[detailed_description\]/g,
                    detailedDescription
                );

                // Write updated content back to file
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Replaced placeholders in ${file}`);
            } catch (fileError) {
                console.error(
                    `Error replacing placeholders in ${file}:`,
                    fileError
                );
                // Continue with other files even if one fails
            }
        }

        return true;
    } catch (error) {
        console.error(`Error copying template files: ${error}`);
        return false;
    }
}

/**
 * Create a new project in /external/host with a git repository and template files
 *
 * @param projectId The ID of the project to create
 * @param processManager Optional ProcessManager instance to create an agent process
 * @returns The project name if successful, null if it fails
 */
export async function createNewProject(projectId: string): Promise<void> {
    const project = await getProject(projectId);
    if (!project) {
        throw new Error(`Project ${projectId} not found in database`);
    }

    // Check if parent directory exists
    const parentDir = '/external/host';
    if (!fs.existsSync(parentDir)) {
        throw new Error(`Parent directory ${parentDir} does not exist`);
    }

    const projectPath = path.join(parentDir, projectId);
    if (fs.existsSync(projectPath)) {
        throw new Error(
            `Sorry the project ${projectId} already exists in the parent directory. Please choose another project_id.`
        );
    }

    // Create a directory for the git repo
    try {
        fs.mkdirSync(projectPath, { recursive: true });
    } catch (mkdirError) {
        throw new Error(
            `Error creating directory ${projectPath}: ${mkdirError}`
        );
    }

    try {
        // Initialize git repository
        execSync('git config --global init.defaultBranch main');
        execSync(`git -C "${projectPath}" init`);

        // Set repo-local identity so the initial commit does not fail with
        // “Author identity unknown”.  We keep this local to the repository
        // (no --global) to avoid touching any host-level Git configuration.
        execSync(`git -C "${projectPath}" config user.name "magi"`);
        execSync(
            `git -C "${projectPath}" config user.email "magi+${projectId}@withmagi.com"`
        );

        // Copy template files to project
        await copyTemplateToProject(projectPath, project.project_type, project);

        // Stage all files and create initial commit
        execSync(`git -C "${projectPath}" add .`);
        execSync(`git -C "${projectPath}" commit -m "Initial template setup"`);

        // Add entry to project history
        await addProjectHistory(projectId, 'Added initial template files');

        project.is_ready = true;
        await updateProject(project);
    } catch (error) {
        // Clean up the created directory on error
        try {
            fs.rmSync(projectPath, { recursive: true, force: true });
        } catch (cleanupError) {
            throw new Error(
                `Error cleaning up directory ${projectPath}: ${cleanupError}`
            );
        }

        throw new Error(
            `Error initializing git repository ${projectPath}: ${error}`
        );
    }
}

/**
 * Build and run Docker containers for projects if they contain a Dockerfile
 * The container is started with `-P` so Docker chooses the host port.
 * Returns a mapping of projectId to the exposed host port.
 */
export async function runProjectContainers(
    processId: string,
    projectIds: string[]
): Promise<Record<string, string>> {
    const portMap: Record<string, string> = {};

    for (const projectId of projectIds) {
        const projectPath = path.join(
            '/magi_output',
            processId,
            'projects',
            projectId
        );
        const dockerfilePath = path.join(projectPath, 'Dockerfile');

        if (!fs.existsSync(dockerfilePath)) {
            continue;
        }

        const imageTag = `${projectId}-${processId}`.toLowerCase();
        await execPromise(`docker build -t ${imageTag} ${projectPath}`);

        const containerName = validateContainerName(
            `task-${processId}-${projectId}`
        );
        const { stdout: runOut } = await execPromise(
            `docker run -d --rm -P --name ${containerName} -v ${projectPath}:/app ${imageTag}`
        );
        const containerId = runOut.trim();

        try {
            const { stdout: portOut } = await execPromise(
                `docker port ${containerId} 3000/tcp`
            );
            const match = portOut.trim().match(/:(\d+)/);
            if (match) {
                portMap[projectId] = match[1];
            }
        } catch (err) {
            console.error('Failed to get port for project container', err);
        }
    }

    return portMap;
}

/**
 * Run a MAGI System Docker container
 * @param options Run options
 * @returns Promise resolving to container ID if successful, empty string if failed
 */
export async function runDockerContainer(
    options: DockerRunOptions
): Promise<string> {
    try {
        const { processId, command, tool, coreProcessId, projectIds } = options;

        // Input validation
        if (!processId || typeof processId !== 'string') {
            throw new Error('Invalid process ID');
        }
        if (!command || typeof command !== 'string') {
            throw new Error('Invalid command');
        }

        const projectRoot = path.resolve(process.cwd(), '..');

        // Generate container name and validate
        const containerName = validateContainerName(`task-${processId}`);

        // Use base64 encoding to avoid escaping issues entirely
        const base64Command = Buffer.from(command).toString('base64');

        // Get the current server port
        const serverPort = process.env.PORT || '3010';
        console.log('Start docker with CONTROLLER_PORT:', serverPort);

        // Create the docker run command using base64 encoded command
        // Get HOST_HOSTNAME from environment variable, fallback to docker service name
        const hostName = process.env.HOST_HOSTNAME || 'magi-controller';

        console.log('***** runDockerContainer', options);

        // Mount git repositories if specified
        const projects = await getAllProjectIds();
        const gitProjectsArray =
            coreProcessId && coreProcessId === processId
                ? projects
                : (projectIds || []).filter(project =>
                      projects.includes(project)
                  );

        console.log('gitProjectsArray', gitProjectsArray);

        // Ensure gitProjects values are unique
        let gitProjects = [...new Set(gitProjectsArray)];

        console.log('projects', projects);
        console.log('gitProjects (before readiness check)', gitProjects);

        // ------------------------------------------------------------------
        // Validate readiness of generated projects
        // ------------------------------------------------------------------
        if (gitProjects.length > 0) {
            const readyProjects: string[] = [];

            for (const projectId of gitProjects) {
                // If this run _is_ the core process, skip waiting and exclude itself
                if (coreProcessId && coreProcessId === processId) {
                    readyProjects.push(projectId);
                    continue;
                }

                if (tool && tool === 'project_update') {
                    readyProjects.push(projectId);
                    continue;
                }

                const proj = await getProject(projectId);
                if (!proj) {
                    console.warn(
                        `[container-manager] Project ${projectId} not found in DB, skipping`
                    );
                    continue;
                }

                // External projects are always mounted immediately
                if (!proj.is_generated) {
                    readyProjects.push(projectId);
                    continue;
                }

                // Generated & already ready – include immediately
                if (proj.is_ready) {
                    readyProjects.push(projectId);
                    continue;
                }

                // ------------------------------------------------------------------
                // Generated but NOT ready – wait (poll) for up to 10 s
                // ------------------------------------------------------------------
                const deadline = Date.now() + 10_000;
                let isReady = proj.is_ready;

                while (!isReady && Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 1_000));
                    const refreshed = await getProject(projectId);
                    isReady = !!refreshed?.is_ready;
                }

                if (!isReady) {
                    throw new Error(
                        `Project ${projectId} is generated but not ready after waiting 10 seconds`
                    );
                }

                readyProjects.push(projectId);
            }

            gitProjects = readyProjects;
        }

        console.log('gitProjects (after readiness check)', gitProjects);

        if (gitProjects.length > 0) {
            // Process each repo using git worktree/clone
            const projectPromises = gitProjects.map(async project => {
                try {
                    return await prepareGitRepository(processId, project);
                } catch (error) {
                    console.error(`Failed to prepare git repository ${project}:`, error);
                    console.log(`Continuing without project ${project}`);
                    return null;
                }
            });
            const results = await Promise.all(projectPromises);
            // Filter out failed repositories
            const successfulProjects = gitProjects.filter((_, index) => results[index] !== null);
            // Update gitProjects to only include successful ones
            gitProjects = successfulProjects;
        }

        // Simply use the environment's TZ variable or empty string
        // The dateFormat function will handle conversion and fallbacks
        const hostTimezone = process.env.TZ || '';

        // Check if we should attach stdout instead of running in detached mode
        const attachStdout = process.env.ATTACH_CONTAINER_STDOUT === 'true';

        // Create the docker run command, removing -d if we want to attach stdout
        const dockerRunCommand = `docker run ${attachStdout ? '' : '-d'} --rm --name ${containerName} \
      -e PROCESS_ID=${processId} \
      -e HOST_HOSTNAME=${hostName} \
      -e CONTROLLER_PORT=${serverPort} \
      -e TZ=${hostTimezone} \
      -e PROCESS_PROJECTS=${gitProjects.join(',')} \
      ${
          options.projectPorts
              ? `-e PROJECT_PORTS=${Object.entries(options.projectPorts)
                    .map(([id, port]) => `${id}:${port}`)
                    .join(',')}`
              : ''
      } \
      --env-file ${path.resolve(projectRoot, '../.env')} \
      -v claude_credentials:/claude_shared:rw \
      -v magi_output:/magi_output:rw \
      -v custom_tools:/custom_tools:rw \
      -v /etc/timezone:/etc/timezone:ro \
      -v /etc/localtime:/etc/localtime:ro \
      --network magi_magi-network \
      magi-engine:latest \
      --tool ${tool || 'none'} \
      --base64 "${base64Command}"`;

        console.log('dockerRunCommand', dockerRunCommand);

        // Execute the command and get the container ID
        // If we're attaching stdout, we'll use spawn instead of execPromise
        if (attachStdout) {
            // We already have spawn imported at the top of the file
            spawn('sh', ['-c', dockerRunCommand], {
                stdio: 'inherit',
            });

            // Return a placeholder ID since we're attached to the process
            return `attached-${containerName}`;
        } else {
            const result = await execPromise(dockerRunCommand);
            return result.stdout.trim();
        }
    } catch (error) {
        throw new Error(`Error starting Docker container: ${error}`);
    }
}

/**
 * Stop a MAGI System Docker container
 * @param processId The process ID of the container
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function stopDockerContainer(processId: string): Promise<boolean> {
    try {
        const containerName = validateContainerName(`task-${processId}`);

        // First check if the container exists and is running
        try {
            const { stdout } = await execPromise(
                `docker container inspect -f '{{.State.Running}}' ${containerName}`
            );
            const isRunning = stdout.trim() === 'true';

            if (!isRunning) {
                console.log(
                    `Container ${containerName} is not running, skipping stop command`
                );
                return true;
            }
        } catch (inspectError) {
            // Container doesn't exist, which is fine during cleanup
            console.log(
                `Container ${containerName} doesn't exist, skipping stop command`
            );
            return true;
        }

        // Stop the container using docker stop command with a timeout (default is 10 seconds)
        // Use a shorter timeout of 2 seconds to speed up the shutdown process
        await execPromise(`docker stop --time=2 ${containerName}`);

        // Clean up git worktrees for this process
        try {
            const projectsDir = path.join('/magi_output', processId, 'projects');
            if (fs.existsSync(projectsDir)) {
                const projects = fs.readdirSync(projectsDir);
                for (const projectId of projects) {
                    const workTreePath = path.join(projectsDir, projectId);
                    const hostPath = path.join('/external/host', projectId);

                    // Check if this is a worktree
                    const isWorktree = await execPromiseFallback(
                        `git -C "${workTreePath}" rev-parse --git-dir | grep -q worktrees`
                    );

                    if (!isWorktree.stderr) {
                        // Remove the worktree
                        console.log(`Removing git worktree: ${workTreePath}`);
                        await execPromise(`git -C "${hostPath}" worktree remove --force "${workTreePath}"`);
                    }
                }
            }
        } catch (worktreeError) {
            console.error('Error cleaning up worktrees:', worktreeError);
            // Continue with cleanup even if worktree removal fails
        }

        // Also stop any project containers for this process
        try {
            const { stdout } = await execPromise(
                `docker ps -a --filter 'name=${containerName}-' -q`
            );
            if (stdout.trim()) {
                const ids = stdout.trim().split('\n');
                for (const id of ids) {
                    await execPromise(`docker stop --time=2 ${id}`);
                }
            }
        } catch (err) {
            console.error('Error stopping project containers', err);
        }

        return true;
    } catch (error) {
        console.error(
            `Error stopping container for process ${processId}:`,
            error
        );
        // We return true here during cleanup to allow the process to continue
        // This prevents one failed container stop from breaking the entire cleanup process
        return true;
    }
}

/**
 * Start monitoring logs from a MAGI System Docker container
 * Note: This is a fallback method for containers that do not use WebSockets
 * The preferred way to get logs is via the CommunicationManager
 *
 * @param processId The process ID of the container
 * @param callback Function to call with each log chunk
 * @returns Function to stop monitoring
 */
export function monitorContainerLogs(
    processId: string,
    callback: (log: string) => void
): () => void {
    try {
        const containerName = validateContainerName(`task-${processId}`);

        // Start the log process (using spawn as it's easier to stream logs this way)
        const logProcess = spawn('docker', ['logs', '-f', containerName]);

        // Handle stdout
        logProcess.stdout.on('data', data => {
            const logData = data.toString();
            callback(logData);

            // Try to parse JSON from logs for backward compatibility
            try {
                // If the log line is valid JSON matching our message format,
                // we can extract structured data from it
                if (
                    logData.trim().startsWith('{') &&
                    logData.includes('"type"')
                ) {
                    const jsonData = JSON.parse(logData);

                    // If this is a valid message with processId, type, and data
                    if (jsonData.processId && jsonData.type && jsonData.data) {
                        // No need to do anything here - the logs will be processed by the callback
                        // This is just to validate that it's a proper message format
                    }
                }
            } catch (jsonError) {
                // Not valid JSON or not our format, that's okay
                // This is just plain log data
            }
        });

        // Handle stderr
        logProcess.stderr.on('data', data => {
            callback(`[ERROR] ${data.toString()}`);
        });

        // Return function to stop monitoring
        return () => {
            logProcess.kill();
        };
    } catch (error) {
        console.error(
            `Error monitoring logs for container ${processId}:`,
            error
        );
        // Return empty function in case of error
        return () => {};
    }
}

/**
 * Get a list of all running MAGI containers
 * @returns Promise resolving to an array of objects containing container info
 */
export async function getRunningMagiContainers(): Promise<
    { id: string; containerId: string; command: string }[]
> {
    try {
        // Get list of running containers with name starting with 'task-'
        const { stdout } = await execPromise(
            "docker ps -a --filter 'name=task-' --filter 'status=running' --format '{{.ID}}|{{.Names}}|{{.Command}}'"
        );

        if (!stdout.trim()) {
            return [];
        }

        // Parse container info and filter out system containers
        return (
            stdout
                .trim()
                .split('\n')
                .map(line => {
                    const [containerId, name, command] = line.split('|');

                    // Extract process ID from name (remove 'task-' prefix)
                    const id = name.replace('task-', '');

                    // Extract original command (it's in the format 'python -m... "command"')
                    const originalCommandMatch = command.match(/"(.+)"$/);
                    const originalCommand = originalCommandMatch
                        ? originalCommandMatch[1]
                        : '';

                    return {
                        id,
                        containerId,
                        command: originalCommand,
                    };
                })
                // Filter out system containers that aren't MAGI LLM process containers
                .filter(container => {
                    // Skip controller container and any other system containers
                    // Valid MAGI process IDs are in format AI-xxxxx
                    return container.id.startsWith('AI-');
                })
        );
    } catch (err) {
        console.error('Error getting running MAGI containers:', err);
        return [];
    }
}

/**
 * Cleanup all MAGI System Docker containers
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function cleanupAllContainers(): Promise<boolean> {
    try {
        // First approach: Stop any containers with task-AI prefix (the ones we create for processes)
        try {
            console.log('Attempt 1: Stopping all AI process containers');
            const stopAICommand =
                "docker ps -a --filter 'name=task-AI' -q | xargs -r docker stop --time=2 2>/dev/null || true";
            await execPromise(stopAICommand);

            // Force remove those containers
            const removeAICommand =
                "docker ps -a --filter 'name=task-AI' -q | xargs -r docker rm -f 2>/dev/null || true";
            await execPromise(removeAICommand);

            // Print what containers are still running
            console.log('Post AI cleanup container check:');
            await execPromise(
                "docker ps --filter 'name=task-AI' --format '{{.Names}}' | xargs -r echo 'Still running: '"
            );
        } catch (commandError) {
            console.error('Error during AI container cleanup:', commandError);
        }

        // Second approach: Try to clean up all task- containers
        try {
            console.log('Attempt 2: Stopping all containers with task- prefix');
            // First attempt to stop all containers with name starting with task- with a 2 second timeout
            const stopCommand =
                "docker ps -a --filter 'name=task-' -q | xargs -r docker stop --time=2 2>/dev/null || true";
            await execPromise(stopCommand);

            // Then try to forcefully remove any containers with the magi-engine image
            const removeCommand =
                "docker ps -a --filter 'ancestor=magi-engine:latest' -q | xargs -r docker rm -f 2>/dev/null || true";
            await execPromise(removeCommand);
        } catch (commandError) {
            console.error(
                'Error during general container cleanup:',
                commandError
            );
        }

        // Third approach: More targeted explicit cleanup with container names
        try {
            console.log('Attempt 3: Explicit container cleanup by name');
            // First, get both running and stopped containers with task-AI prefix
            const { stdout: aiContainerStdout } = await execPromise(
                "docker ps -a --filter 'name=task-AI' --format '{{.Names}}'"
            );

            if (aiContainerStdout.trim()) {
                const aiContainerNames = aiContainerStdout.trim().split('\n');
                console.log(
                    `Found ${aiContainerNames.length} AI containers to clean up: ${aiContainerNames.join(', ')}`
                );

                // First stop all AI containers in parallel
                await Promise.all(
                    aiContainerNames.map(async containerName => {
                        try {
                            console.log(
                                `Stopping AI container ${containerName}`
                            );
                            await execPromise(
                                `docker stop --time=2 ${containerName}`
                            );
                        } catch (containerError) {
                            console.error(
                                `Error stopping AI container ${containerName}:`,
                                containerError
                            );
                        }
                    })
                );

                // Then remove all AI containers in parallel
                await Promise.all(
                    aiContainerNames.map(async containerName => {
                        try {
                            console.log(
                                `Removing AI container ${containerName}`
                            );
                            await execPromise(`docker rm -f ${containerName}`);
                        } catch (containerError) {
                            console.error(
                                `Error removing AI container ${containerName}:`,
                                containerError
                            );
                        }
                    })
                );
            }

            // Next, get all other magi containers
            const { stdout } = await execPromise(
                "docker ps -a --filter 'name=task-' --format '{{.Names}}'"
            );

            if (stdout.trim()) {
                const containerNames = stdout.trim().split('\n');
                console.log(
                    `Found ${containerNames.length} other MAGI containers to clean up: ${containerNames.join(', ')}`
                );

                // First stop all containers in parallel
                await Promise.all(
                    containerNames.map(async containerName => {
                        try {
                            console.log(`Stopping container ${containerName}`);
                            await execPromise(
                                `docker stop --time=2 ${containerName}`
                            );
                        } catch (containerError) {
                            console.error(
                                `Error stopping container ${containerName}:`,
                                containerError
                            );
                        }
                    })
                );

                // Then remove all containers in parallel
                await Promise.all(
                    containerNames.map(async containerName => {
                        try {
                            console.log(`Removing container ${containerName}`);
                            await execPromise(`docker rm -f ${containerName}`);
                        } catch (containerError) {
                            console.error(
                                `Error removing container ${containerName}:`,
                                containerError
                            );
                        }
                    })
                );
            }
        } catch (listError) {
            console.error('Error listing containers for cleanup:', listError);
        }

        // Final verification: Are there still any containers left?
        try {
            console.log('Final verification of container cleanup');
            const { stdout: finalCheck } = await execPromise(
                "docker ps -a --filter 'name=task-' --format '{{.Names}}'"
            );

            if (finalCheck.trim()) {
                console.log(
                    `WARNING: After all cleanup attempts, still found containers: ${finalCheck.trim()}`
                );
                // One last desperate attempt with force
                console.log('Performing final force cleanup');
                await execPromise(
                    "docker ps -a --filter 'name=task-' -q | xargs -r docker rm -f"
                );
            } else {
                console.log('All containers successfully removed');
            }
        } catch (finalError) {
            console.error('Error in final verification:', finalError);
        }

        return true;
    } catch (error) {
        console.error('Error in cleanupAllContainers:', error);
        // Still return true to allow the shutdown process to continue

        // Even in case of error, try one last time to clean up
        try {
            console.log('Emergency cleanup after error');
            await execPromise(
                "docker ps -a --filter 'name=task-' -q | xargs -r docker rm -f 2>/dev/null || true"
            );
        } catch (e) {
            // Ignore any errors in this last-ditch effort
        }

        return true;
    }
}
