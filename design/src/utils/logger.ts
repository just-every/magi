/**
 * LLM call logger for the design package
 */

import fs from 'fs';
import path from 'path';
import { setEnsembleLogger } from '@just-every/ensemble';

// Type definitions for better type safety
interface MessagePart {
    type: string;
    text?: string;
}

interface Message {
    content?: string | MessagePart[];
}

interface RequestData {
    messages?: Message[];
    temperature?: number;
    max_tokens?: number;
    tools?: unknown[];
}

interface ResponseData {
    content?: string;
    tool_calls?: Array<{ name?: string }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    finish_reason?: string;
}

interface ErrorData {
    message?: string;
    type?: string;
    code?: string;
    status?: number;
}

// Ensure log directory exists
function ensureLogDir(logDir: string) {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Truncate large values in objects (like base64 images)
function truncateLargeValues(obj: unknown, maxLength: number = 1000): unknown {
    if (typeof obj === 'string') {
        if (obj.startsWith('data:image/') && obj.length > maxLength) {
            return `${obj.substring(0, 100)}...[truncated ${formatBytes(obj.length)}]`;
        }
        return obj.length > maxLength ? obj.substring(0, maxLength) + '...' : obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => truncateLargeValues(item, maxLength));
    }
    
    if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = truncateLargeValues(value, maxLength);
        }
        return result;
    }
    
    return obj;
}

export function initializeLLMLogger() {
    // Set up log directory
    const outputDir = process.env.DESIGN_OUTPUT_DIR || path.join(process.cwd(), '.output');
    const logDir = path.join(outputDir, 'llm-logs');
    ensureLogDir(logDir);
    
    // Create session directory with timestamp
    const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionDir = path.join(logDir, `session-${sessionTimestamp}`);
    ensureLogDir(sessionDir);
    
    // Summary log file for quick overview
    const summaryFile = path.join(sessionDir, 'summary.jsonl');
    
    // Track ongoing requests
    const requestMap = new Map<string, { 
        start: number; 
        provider: string; 
        model: string;
        agent: string;
        requestData: unknown;
    }>();
    
    // Request counter for unique filenames
    let requestCounter = 0;
    
    // Write summary log entry
    function writeSummary(entry: unknown) {
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(summaryFile, line);
    }
    
    // Write full request/response data
    function writeFullLog(filename: string, data: unknown) {
        const filePath = path.join(sessionDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    
    // Log initial session info
    const sessionInfo = {
        type: 'session_start',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        cwd: process.cwd(),
        node_version: process.version,
    };
    writeSummary(sessionInfo);
    writeFullLog('session-info.json', sessionInfo);
    
    setEnsembleLogger({
        log_llm_request: (agent: string, provider: string, model: string, data: unknown) => {
            requestCounter++;
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            const timestamp = new Date().toISOString();
            const requestNum = String(requestCounter).padStart(4, '0');
            
            // Store request info
            requestMap.set(id, { 
                start: Date.now(), 
                provider, 
                model,
                agent,
                requestData: data
            });
            
            // Extract message content for summary
            let messageContent = '';
            let messageCount = 0;
            let hasImages = false;
            
            const typedData = data as RequestData;
            if (typedData && typedData.messages && Array.isArray(typedData.messages)) {
                messageCount = typedData.messages.length;
                const lastMessage = typedData.messages[typedData.messages.length - 1];
                if (lastMessage && lastMessage.content) {
                    if (typeof lastMessage.content === 'string') {
                        messageContent = lastMessage.content.substring(0, 200);
                    } else if (Array.isArray(lastMessage.content)) {
                        // Handle multi-part messages
                        for (const part of lastMessage.content) {
                            if (part.type === 'text' && part.text) {
                                messageContent = part.text.substring(0, 200);
                                break;
                            } else if (part.type === 'image') {
                                hasImages = true;
                            }
                        }
                    }
                }
            }
            
            // Log to console
            console.log(`[${timestamp}] → ${provider}/${model}`);
            
            // Write full request data
            const requestFilename = `${requestNum}-request-${provider}-${model}.json`;
            const fullRequestData = {
                timestamp,
                provider,
                model,
                agent_id: agent,
                request: truncateLargeValues(data),
            };
            writeFullLog(requestFilename, fullRequestData);
            
            // Write summary
            writeSummary({
                type: 'request',
                id,
                timestamp,
                agent,
                provider,
                model,
                request_num: requestNum,
                filename: requestFilename,
                message_count: messageCount,
                last_message_preview: messageContent,
                has_images: hasImages,
                options: {
                    temperature: (data as RequestData)?.temperature,
                    max_tokens: (data as RequestData)?.max_tokens,
                    tools: (data as RequestData)?.tools?.length || 0,
                }
            });
            
            return id;
        },
        
        log_llm_response: (id: string, data: unknown) => {
            const timestamp = new Date().toISOString();
            const requestInfo = requestMap.get(id);
            
            if (!requestInfo) {
                console.warn(`[${timestamp}] ← Unknown request ID: ${id}`);
                return;
            }
            
            const response = data as ResponseData;
            const duration = Date.now() - requestInfo.start;
            const requestNum = String(requestCounter).padStart(4, '0');
            
            // Log to console
            const tokens = response.usage?.total_tokens || 0;
            console.log(`[${timestamp}] ← ${tokens} tokens (${duration}ms)`);
            
            // Write full response data
            const responseFilename = `${requestNum}-response-${requestInfo.provider}-${requestInfo.model}.json`;
            const fullResponseData = {
                timestamp,
                provider: requestInfo.provider,
                model: requestInfo.model,
                agent_id: requestInfo.agent,
                duration_ms: duration,
                request: truncateLargeValues(requestInfo.requestData),
                response: truncateLargeValues(data),
            };
            writeFullLog(responseFilename, fullResponseData);
            
            // Write summary
            writeSummary({
                type: 'response',
                id,
                timestamp,
                request_num: requestNum,
                filename: responseFilename,
                duration_ms: duration,
                usage: response.usage || {},
                finish_reason: response.finish_reason,
                has_tool_calls: !!(response.tool_calls && response.tool_calls.length > 0),
                response_preview: response.content ? response.content.substring(0, 200) : '',
            });
            
            // Clean up
            requestMap.delete(id);
        },
        
        log_llm_error: (id: string, error: unknown) => {
            const timestamp = new Date().toISOString();
            const requestInfo = requestMap.get(id);
            const requestNum = String(requestCounter).padStart(4, '0');
            
            // Log to console
            console.error(`[${timestamp}] ✗ Error:`, error);
            
            if (requestInfo) {
                // Write full error data
                const errorFilename = `${requestNum}-error-${requestInfo.provider}-${requestInfo.model}.json`;
                const fullErrorData = {
                    timestamp,
                    provider: requestInfo.provider,
                    model: requestInfo.model,
                    agent_id: requestInfo.agent,
                    duration_ms: Date.now() - requestInfo.start,
                    request: truncateLargeValues(requestInfo.requestData),
                    error: {
                        message: (error as Error).message || String(error),
                        name: (error as Error).name,
                        code: (error as ErrorData).code,
                        stack: (error as Error).stack,
                    }
                };
                writeFullLog(errorFilename, fullErrorData);
                
                // Write summary
                writeSummary({
                    type: 'error',
                    id,
                    timestamp,
                    request_num: requestNum,
                    filename: errorFilename,
                    duration_ms: Date.now() - requestInfo.start,
                    error: {
                        message: (error as Error).message || String(error),
                        name: (error as Error).name,
                        code: (error as ErrorData).code,
                        stack: (error as Error).stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines for summary
                    }
                });
                
                // Clean up
                requestMap.delete(id);
            } else {
                // Log error without request info
                writeSummary({
                    type: 'error',
                    id,
                    timestamp,
                    error: {
                        message: (error as Error).message || String(error),
                        name: (error as Error).name,
                        code: (error as ErrorData).code,
                    }
                });
            }
        }
    });
    
    console.log(`📝 LLM calls will be logged to: ${sessionDir}`);
    
    // Add session end handler
    process.on('exit', (code) => {
        const sessionEnd = {
            type: 'session_end',
            timestamp: new Date().toISOString(),
            exit_code: code,
            pending_requests: requestMap.size,
            total_requests: requestCounter,
        };
        writeSummary(sessionEnd);
        writeFullLog('session-end.json', sessionEnd);
    });
}