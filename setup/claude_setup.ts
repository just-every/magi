/**
 * Set up Claude authentication in a Docker container using a shared volume.
 */
import {spawn, exec} from 'child_process';

/**
 * Launch an interactive Docker container to set up Claude authentication.
 * Uses a shared Docker volume for credential persistence.
 */
export async function setupClaudeAuth(): Promise<boolean> {
	console.log("Setting up Claude authentication...");

	try {
		const volumeExistsResult = await new Promise<string>((resolve, reject) => {
			exec('docker volume ls --filter name=claude_credentials --format "{{.Name}}"', (error, stdout) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout.trim());
			});
		});

		if (!volumeExistsResult) {
			console.log("Creating shared claude_credentials volume...");
			await new Promise<void>((resolve, reject) => {
				exec('docker volume create claude_credentials', (error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		}

		// Setup command to create directories and symlinks in the container before running claude
		const setupCmd = `
      mkdir -p /claude_shared/.claude && \\
      touch /claude_shared/.claude.json && \\
      chmod -R 777 /claude_shared && \\
      rm -rf /home/magi_user/.claude && \\
      rm -f /home/magi_user/.claude.json && \\
      ln -sf /claude_shared/.claude /home/magi_user/.claude && \\
      ln -sf /claude_shared/.claude.json /home/magi_user/.claude.json && \\
      ls -la /home/magi_user/ | grep claude && \\
      ls -la /claude_shared/ && \\
      claude --dangerously-skip-permissions
    `;

		const containerIdResult = await new Promise<string>((resolve, reject) => {
			exec(
				`docker run -d --rm -v claude_credentials:/claude_shared -it magi-system:latest sh -c "${setupCmd}"`,
				(error, stdout) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(stdout.trim());
				}
			);
		});

		const containerId = containerIdResult;

		console.log("Please follow the prompts to authenticate Claude...");
		console.log('\x1b[32m%s\x1b[0m', 'Press Ctrl+C twice to exit once Claude Code has authenticated.');
		console.log("");

		// Run docker attach in a child process
		const attachProcess = spawn('docker', ['attach', containerId], {
			stdio: 'inherit',
			shell: true
		});

		await new Promise<void>((resolve) => {
			attachProcess.on('exit', () => {
				console.log("\nAuthentication process completed.");
				console.log("If you successfully authenticated, Claude credentials are now stored in the shared volume.");
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
