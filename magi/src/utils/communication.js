"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunicationManager = void 0;
exports.initCommunication = initCommunication;
exports.getCommunicationManager = getCommunicationManager;
const ws_1 = __importDefault(require("ws"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const file_utils_js_1 = require("./file_utils.js");
class CommunicationManager {
    constructor(processId, testMode = false) {
        this.ws = null;
        this.connected = false;
        this.messageQueue = [];
        this.messageHistory = [];
        this.reconnectInterval = 3000;
        this.reconnectTimer = null;
        this.commandListeners = [];
        this.controllerPort = process.env.CONTROLLER_PORT;
        this.processId = processId;
        this.testMode = testMode;
        this.historyFile = path_1.default.join((0, file_utils_js_1.get_output_dir)('communication'), 'messages.json');
        if (this.testMode) {
            console.log('[Communication] Test mode: WebSocket disabled, will print to console');
        }
        else {
            this.loadHistoryFromFile();
        }
    }
    connect() {
        if (this.testMode) {
            this.connected = true;
            return;
        }
        const url = `ws://host.docker.internal:${this.controllerPort}/ws/magi/${this.processId}`;
        if (this.ws) {
            this.ws.terminate();
        }
        console.log(`Connecting to controller at ${url}`);
        this.ws = new ws_1.default(url);
        this.ws.on('open', () => {
            console.log('Connected to controller');
            this.connected = true;
            this.sendQueuedMessages();
            this.sendMessage({
                processId: this.processId,
                event: {
                    type: 'connected',
                    timestamp: new Date().toISOString()
                }
            });
        });
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('Received command:', message);
                if (message.type === 'connect') {
                    if (message.args && message.args.controllerPort) {
                        const newPort = message.args.controllerPort;
                        if (newPort !== this.controllerPort) {
                            console.log(`Controller port changed from ${this.controllerPort} to ${newPort}`);
                            this.controllerPort = newPort;
                        }
                    }
                    return;
                }
                this.commandListeners.forEach(listener => {
                    try {
                        listener(message);
                    }
                    catch (err) {
                        console.error('Error in command listener:', err);
                    }
                });
            }
            catch (err) {
                console.error('Error parsing message:', err);
            }
        });
        this.ws.on('close', () => {
            console.log('Disconnected from controller, scheduling reconnect');
            this.connected = false;
            if (!this.reconnectTimer) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    this.connect();
                }, this.reconnectInterval);
            }
        });
        this.ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            this.connected = false;
        });
    }
    onCommand(listener) {
        this.commandListeners.push(listener);
    }
    sendMessage(message) {
        if (!this.testMode) {
            this.messageHistory.push(message);
            this.saveHistoryToFile();
        }
        if (this.testMode) {
            return this.testModeMessage(message);
        }
        console.log(`[JSON_MESSAGE] ${JSON.stringify(message)}`);
        if (this.connected && this.ws) {
            try {
                this.ws.send(JSON.stringify(message));
            }
            catch (err) {
                console.error('Error sending message:', err);
                this.messageQueue.push(message);
            }
        }
        else {
            this.messageQueue.push(message);
        }
    }
    testModeMessage(message) {
        const timestamp = new Date().toISOString().substring(11, 19);
        console.log(`[${timestamp}]`);
        console.dir(message, { depth: 4, colors: true });
    }
    send(event) {
        if (event.type === 'message_start' || event.type === 'message_delta' || event.type === 'message_complete') {
            const messageEvent = event;
            if (event.type === 'message_start' && !messageEvent.message_id) {
                messageEvent.message_id = (0, uuid_1.v4)();
            }
            if (!messageEvent.message_id) {
                console.warn('Message event missing message_id, generating a new one');
                messageEvent.message_id = (0, uuid_1.v4)();
            }
        }
        this.sendMessage({
            processId: this.processId,
            event
        });
    }
    sendQueuedMessages() {
        if (!this.connected || !this.ws)
            return;
        const queueCopy = [...this.messageQueue];
        this.messageQueue = [];
        for (const message of queueCopy) {
            try {
                this.ws.send(JSON.stringify(message));
            }
            catch (err) {
                console.error('Error sending queued message:', err);
                this.messageQueue.push(message);
            }
        }
    }
    loadHistoryFromFile() {
        try {
            if (fs_1.default.existsSync(this.historyFile)) {
                const data = fs_1.default.readFileSync(this.historyFile, 'utf8');
                this.messageHistory = JSON.parse(data);
                console.log(`Loaded ${this.messageHistory.length} historical messages`);
            }
        }
        catch (err) {
            console.error('Error loading message history:', err);
        }
    }
    saveHistoryToFile() {
        try {
            fs_1.default.writeFileSync(this.historyFile, JSON.stringify(this.messageHistory, null, 2), 'utf8');
        }
        catch (err) {
            console.error('Error saving message history:', err);
        }
    }
    getMessageHistory() {
        return [...this.messageHistory];
    }
    close() {
        if (this.testMode) {
            console.log('[Communication] Test mode - WebSocket connection closed (simulated)');
            this.connected = false;
            return;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        this.connected = false;
    }
}
exports.CommunicationManager = CommunicationManager;
let communicationManager = null;
function initCommunication(testMode = false) {
    if (!communicationManager) {
        communicationManager = new CommunicationManager(process.env.PROCESS_ID, testMode);
        communicationManager.connect();
    }
    return communicationManager;
}
function getCommunicationManager() {
    if (!communicationManager) {
        throw new Error('Communication manager not initialized');
    }
    return communicationManager;
}
//# sourceMappingURL=communication.js.map