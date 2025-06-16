/**
 * Set up Claude authentication in a Docker container using a shared volume.
 */
import { spawn, exec } from 'child_process';

/**
 * Launch an interactive Docker container to set up Claude authentication.
 * Uses a shared Docker volume for credential persistence.
 */
export async function setupClaudeAuth(): Promise<boolean> {
    console.log('Setting up Claude authentication...');

    try {
        // Setup command to create directories and symlinks in the container before running claude
        const setupCmd = `exec claude --dangerously-skip-permissions --debug`;

        const containerIdResult = await new Promise<string>(
            (resolve, reject) => {
                exec(
                    `docker run -d --rm -v claude_credentials:/claude_shared -it magi-engine:latest sh -c "${setupCmd}"`,
                    (error, stdout) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve(stdout.trim());
                    }
                );
            }
        );

        const containerId = containerIdResult;

        console.log('Please follow the prompts to authenticate Claude...');
        console.log(
            '\x1b[32m%s\x1b[0m',
            'Press Ctrl+C twice to exit once Claude Code has authenticated.'
        );
        console.log('');

        // Run docker attach in a child process
        const attachProcess = spawn('docker', ['attach', containerId], {
            stdio: 'inherit',
            shell: true,
        });

        await new Promise<void>(resolve => {
            attachProcess.on('exit', () => {
                console.log('\nAuthentication process completed.');
                console.log(
                    'If you successfully authenticated, Claude credentials are now stored in the shared volume.'
                );
                resolve();
            });
        });

        // Verify the volume has the expected files
        try {
            await new Promise<string>((resolve, reject) => {
                exec(
                    'docker run --rm -v claude_credentials:/claude_data:ro alpine:latest sh -c "ls -la /claude_data/.claude/ && cat /claude_data/.claude.json"',
                    (error, stdout) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve(stdout);
                    }
                );
            });
        } catch (verifyError) {
            console.log(`Could not verify volume contents: ${verifyError}`);
        }

        return true;
    } catch (error) {
        console.log(`Error during Claude authentication: ${error}`);
        return false;
    }
}

// Allow running directly as ES module
if (import.meta.url === `file://${process.argv[1]}`) {
    setupClaudeAuth().catch(console.error);
}
