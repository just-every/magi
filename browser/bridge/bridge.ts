/**
 * Native Messaging Host & WebSocket Bridge for MAGI Browser Control.
 *
 * Changes:
 * - Reverted logging to use console.error (stderr) instead of a file.
 * - Kept timestamps via logError helper.
 * - Kept correct process.exit(0) in stdin 'end' handler.
 * - Kept global exception handlers.
 */

import * as util from 'util';
import { Writable, Readable } from 'stream';
import WebSocket, { WebSocketServer } from 'ws';

// --- Logging Setup ---
// Helper function for timestamped logs to STDERR
const logError = (...args: any[]) => {
	const timestamp = new Date().toISOString();
	// Format message using util.inspect for better object representation on stderr
	const message = args.map(arg =>
		typeof arg === 'string' ? arg : util.inspect(arg, { depth: 3, colors: process.stderr.isTTY }) // Use colors only if stderr is a TTY
	).join(' ');
	console.error(`[${timestamp}] [BRIDGE] ${message}`); // Log to stderr
};

// --- Global Error Handlers (Log to stderr) ---
process.on('uncaughtException', (err, origin) => {
	logError(`FATAL: UNCAUGHT EXCEPTION`);
	logError(`Origin: ${origin}`);
	logError(err?.stack || err);
	logError(`Forcing exit with code 1 due to uncaught exception.`);
	process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
	logError('FATAL: UNHANDLED PROMISE REJECTION');
	if (reason instanceof Error) { logError('Reason:', reason.stack || reason); }
	else { logError('Reason:', util.inspect(reason, { depth: 3, colors: process.stderr.isTTY })); }
	logError('Forcing exit with code 1 due to unhandled rejection.');
	process.exit(1);
});


// --- Configuration ---
const WEBSOCKET_PORT = 9001;
const NATIVE_MSG_TIMEOUT = 30000;
const WS_PING_INTERVAL = 20000;

// --- Types ---
interface ExtensionResponse { requestId: number; status: 'ok' | 'error'; result?: any; error?: string; details?: string; tabId?: string; }
interface WebSocketCommand { wsRequestId: string; command: string; params?: any; tabId?: string; }
interface WebSocketResponse { wsRequestId: string; status: 'ok' | 'error'; result?: any; error?: string; details?: string; tabId?: string; }
interface PendingNativeRequest { wsClient: WebSocket; wsRequestId: string; timeoutId: NodeJS.Timeout; }

// --- Native Messaging Communication ---
logError('Evaluating bridge.js script...');

const nativeInput = process.stdin as Readable;
const nativeOutput = process.stdout as Writable;
let nativeMessageQueue: Buffer[] = [];
let currentNativeMessageLength: number | null = null;
let nativeRequestIdCounter = 1;
const pendingNativeRequests = new Map<number, PendingNativeRequest>();

nativeInput.on('data', (chunk: Buffer) => {
	nativeMessageQueue.push(chunk);
	processNativeMessageQueue();
});

nativeInput.on('end', () => {
	logError('Native host input stream \'end\' event received.');
	try {
		const serverListening = wss && !wss_closed;
		logError(`WebSocket server status: ${serverListening ? 'Listening (or closing)' : 'Closed'}`);
		logError(`Number of active WS clients: ${activeWsClients?.size ?? 'N/A'}`);
	} catch (e) { logError('Error logging state during stdin end:', e); }
	logError('Closing WebSocket connections now...');
	if (wss && !wss_closed) { wss.close(); }
	else { logError('WebSocket server already closed or not initialized.'); }
	logError('Exiting process with code 0 due to stdin end.');
	process.exit(0); // Correct exit behavior
});

nativeInput.on('error', (err) => {
	logError('Native host input stream error:', err);
	if (wss && !wss_closed) { wss.close(); }
	process.exit(1);
});

// --- processNativeMessageQueue function (Uses logError -> stderr) ---
function processNativeMessageQueue() {
	while (true) {
		if (currentNativeMessageLength === null) {
			try {
				const combinedBuffer = Buffer.concat(nativeMessageQueue);
				if (combinedBuffer.length < 4) { nativeMessageQueue = [combinedBuffer]; break; }
				currentNativeMessageLength = combinedBuffer.readUInt32LE(0);
				nativeMessageQueue = [combinedBuffer.slice(4)];
			} catch (e) { logError('Error reading native message length:', e); nativeMessageQueue = []; currentNativeMessageLength = null; break; }
		}
		if (currentNativeMessageLength === null) { logError('Internal state error...'); break; }

		const combinedBuffer = Buffer.concat(nativeMessageQueue);
		if (combinedBuffer.length < currentNativeMessageLength) { nativeMessageQueue = [combinedBuffer]; break; }

		const messageBuffer = combinedBuffer.slice(0, currentNativeMessageLength);
		const remainingBuffer = combinedBuffer.slice(currentNativeMessageLength);
		nativeMessageQueue = [remainingBuffer];
		const messageLength = currentNativeMessageLength;
		currentNativeMessageLength = null;

		const messageJson = messageBuffer.toString('utf8');
		logError(`Raw message received (Length: ${messageLength}): ${messageJson}`);

		try {
			const response = JSON.parse(messageJson) as ExtensionResponse;
			if (response.requestId === undefined || !response.status) { logError(`Invalid response format...`, response); continue; }
			logError(`EXT->BRIDGE] Native ID ${response.requestId} Status: ${response.status}`, response.result || response.error || '');
			const pendingRequest = pendingNativeRequests.get(response.requestId);
			if (pendingRequest) {
				clearTimeout(pendingRequest.timeoutId);
				pendingNativeRequests.delete(response.requestId);
				if (response.status === 'error') { logError(`Relaying error from extension...`); }
				sendWebSocketResponse(pendingRequest.wsClient, {
					wsRequestId: pendingRequest.wsRequestId,
					status: response.status,
					result: response.result,
					error: response.error,
					details: response.details,
					tabId: response.tabId
				});
			} else {
				if (response.requestId === 0) { logError(`Received message with requestId 0...`); }
				else { logError(`Received native response for unknown/timed-out request ID: ${response.requestId}`); }
			}
		} catch (error) {
			logError(`Error processing native message JSON...`, error);
			logError(`Raw message JSON content that failed parsing:`, messageJson);
		}

		if (remainingBuffer.length === 0) break;
	}
}

// --- WebSocket Server (Uses logError -> stderr) ---
let wss: WebSocketServer | null = null;
let wss_closed = false;
const activeWsClients = new Set<WebSocket>();

try {
	logError('Starting WebSocket server on port 9001...');
	wss = new WebSocketServer({ port: WEBSOCKET_PORT });
	wss.on('connection', (ws: WebSocket) => {
		logError('WebSocket client connected.');
		activeWsClients.add(ws);
		(ws as any).isAlive = true;
		ws.on('pong', () => { (ws as any).isAlive = true; });
		ws.on('message', async (message: Buffer) => {
			logError('Received WebSocket message:', message.toString());
			let command: WebSocketCommand;
			try {
				command = JSON.parse(message.toString());
				if (!command.wsRequestId || !command.command) { throw new Error('Invalid command format: wsRequestId and command are required.'); }
			} catch (error) {
				logError('Failed to parse WebSocket message or invalid format:', error);
				sendWebSocketResponse(ws, { wsRequestId: 'unknown', status: 'error', error: 'Invalid message format received by bridge.' });
				return;
			}
			const nativeRequestId = nativeRequestIdCounter++;
			const timeoutId = setTimeout(() => {
				if (pendingNativeRequests.has(nativeRequestId)) {
					const pending = pendingNativeRequests.get(nativeRequestId)!;
					pendingNativeRequests.delete(nativeRequestId);
					const errorMsg = `Request to extension timed out after ${NATIVE_MSG_TIMEOUT / 1000}s (Native ID: ${nativeRequestId}, Command: ${command.command})`;
					logError(errorMsg);
					sendWebSocketResponse(pending.wsClient, { wsRequestId: pending.wsRequestId, status: 'error', error: 'Request to browser extension timed out.', details: `Native Request ID: ${nativeRequestId}` });
				}
			}, NATIVE_MSG_TIMEOUT);
			pendingNativeRequests.set(nativeRequestId, { wsClient: ws, wsRequestId: command.wsRequestId, timeoutId: timeoutId });
			try {
				const nativeMessage = { requestId: nativeRequestId, command: command.command, params: command.params, tabId: command.tabId };
				const messageJson = JSON.stringify(nativeMessage);
				const messageBuffer = Buffer.from(messageJson, 'utf8');
				const lengthBuffer = Buffer.alloc(4);
				lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

				if (nativeOutput.writable) {
					nativeOutput.write(lengthBuffer);
					nativeOutput.write(messageBuffer);
					logError(`BRIDGE->EXT] Native ID ${nativeRequestId} (from WS ID ${command.wsRequestId}): ${command.command}`, command.params || {});
				} else {
					logError("Error: Native output stream is not writable when trying to send message.");
					clearTimeout(timeoutId);
					pendingNativeRequests.delete(nativeRequestId);
					sendWebSocketResponse(ws, { wsRequestId: command.wsRequestId, status: 'error', error: 'Bridge failed to send command to extension: Native output stream closed.', details: `Native Request ID: ${nativeRequestId}` });
				}
			} catch (error) {
				clearTimeout(timeoutId);
				pendingNativeRequests.delete(nativeRequestId);
				const errorMsg = `Failed to write command to extension: ${error instanceof Error ? error.message : String(error)}`;
				logError(errorMsg);
				sendWebSocketResponse(ws, { wsRequestId: command.wsRequestId, status: 'error', error: `Bridge failed to send command to extension: ${error instanceof Error ? error.message : String(error)}`, details: `Native Request ID: ${nativeRequestId}` });
			}
		});
		ws.on('close', (code, reason) => {
			logError(`WebSocket client disconnected. Code: ${code}, Reason: ${reason?.toString()}`);
			activeWsClients.delete(ws);
			const requestsToRemove: number[] = [];
			pendingNativeRequests.forEach((pending, nativeId) => { if (pending.wsClient === ws) { clearTimeout(pending.timeoutId); requestsToRemove.push(nativeId); logError(`Clearing pending native request ${nativeId} due to WS client disconnect (WS ID: ${pending.wsRequestId}).`); } });
			requestsToRemove.forEach(id => pendingNativeRequests.delete(id));
		});
		ws.on('error', (error) => {
			logError('WebSocket client error:', error);
			activeWsClients.delete(ws);
			if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) { ws.close(); }
			const requestsToRemove: number[] = [];
			pendingNativeRequests.forEach((pending, nativeId) => { if (pending.wsClient === ws) { clearTimeout(pending.timeoutId); requestsToRemove.push(nativeId); logError(`Clearing pending native request ${nativeId} due to WS client error (WS ID: ${pending.wsRequestId}).`); } });
			requestsToRemove.forEach(id => pendingNativeRequests.delete(id));
		});
	});
	wss.on('error', (error) => { logError('WebSocket Server error:', error); try { if (!nativeInput.destroyed) nativeInput.destroy(); } catch (e) { logError('Error destroying native input on WSS error:', e) } process.exit(1); });
	wss.on('close', () => { logError('WebSocket server closed.'); wss_closed = true; try { if (!nativeInput.destroyed) nativeInput.destroy(); } catch (e) { logError('Error destroying native input on WS close:', e) } });
	logError(`WebSocket server listening on ws://localhost:${WEBSOCKET_PORT}`);
} catch (e) { logError('Failed to initialize WebSocket server:', e); process.exit(1); }

// --- WebSocket Heartbeat (Uses logError -> stderr) ---
let wsHeartbeatInterval: NodeJS.Timeout | null = null;
if (wss) {
	wsHeartbeatInterval = setInterval(() => {
		activeWsClients.forEach((ws: WebSocket) => {
			if ((ws as any).isAlive === false) { logError('WebSocket client unresponsive...'); return ws.terminate(); }
			(ws as any).isAlive = false;
			ws.ping((err) => { if (err) { logError('Error sending ping:', err); ws.terminate(); } });
		});
	}, WS_PING_INTERVAL);
}

// --- sendWebSocketResponse function (Uses logError -> stderr) ---
function sendWebSocketResponse(wsClient: WebSocket, response: WebSocketResponse) {
	if (wsClient.readyState === WebSocket.OPEN) {
		try {
			wsClient.send(JSON.stringify(response));
			logError(`BRIDGE->WS] Sent response for WS ID ${response.wsRequestId}, Status: ${response.status}`);
		} catch (error) { logError(`Failed to send WebSocket response...`, error); wsClient.terminate(); }
	} else {
		logError(`Cannot send WebSocket response... client state is ${wsClient.readyState}`);
		const requestsToRemove: number[] = [];
		pendingNativeRequests.forEach((pending, nativeId) => { if (pending.wsClient === wsClient) { clearTimeout(pending.timeoutId); requestsToRemove.push(nativeId); logError(`Clearing pending native request ${nativeId} as WS client state is not OPEN (WS ID: ${pending.wsRequestId}).`); } });
		requestsToRemove.forEach(id => pendingNativeRequests.delete(id));
	}
}

// --- Graceful Shutdown (Uses logError -> stderr) ---
function gracefulShutdown(signal: string) {
	logError(`Received ${signal}. Shutting down gracefully...`);
	if (wsHeartbeatInterval) { clearInterval(wsHeartbeatInterval); }
	logError(`Closing ${activeWsClients.size} active WebSocket connections...`);
	activeWsClients.forEach(ws => { ws.close(1001, "Server shutting down"); });
	activeWsClients.clear();
	if (wss && !wss_closed) {
		logError('Closing WebSocket server...');
		wss.close(() => { logError('WebSocket server closed.'); shutdownNativeConnection(); });
	} else {
		logError('WebSocket server already closed or not initialized, proceeding with shutdown.');
		shutdownNativeConnection();
	}
	setTimeout(() => { logError('Graceful shutdown timed out. Forcing exit.'); process.exit(1); }, 5000);
}
function shutdownNativeConnection() {
	try {
		if (!nativeInput.destroyed) { logError('Closing native input stream...'); nativeInput.destroy(); }
	} catch (e) { logError('Error destroying native input during shutdown:', e); }
	finally {
		logError('Shutdown complete. Exiting process now.');
		process.exit(0); // Correctly exit when shutdown is called
	}
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

logError('Native messaging host script setup complete. Waiting for events.');
