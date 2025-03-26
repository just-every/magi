/**
 * ProcessBox Component
 * Renders a process card with messages, status, and input controls
 */
import * as React from 'react';
import { useRef, useEffect } from 'react';
import { ProcessStatus } from '@types';
import { useSocket } from '../context/SocketContext';
import MessageList from './message/MessageList';
import ProcessHeader from './ui/ProcessHeader';
import ProcessInput from './ui/ProcessInput';

interface ProcessBoxProps {
    id: string;
    command: string;
    status: ProcessStatus;
    colors: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
    logs: string;
    focused: boolean;
    onFocus: (id: string, focusMode?: 'parent-and-children' | 'only-box') => void;
}

/**
 * The ProcessBox component is the main container for a process
 * It displays process information, messages, and handles user input
 */
const ProcessBox: React.FC<ProcessBoxProps> = ({
    id,
    status,
    colors,
    logs,
    focused,
    onFocus
}) => {
    const { sendProcessCommand, terminateProcess, processes } = useSocket();
    const logsRef = useRef<HTMLDivElement>(null);

    // Get data directly from the socket context
    const process = processes.get(id);
    const messages = process ? process.agent.messages : [];
    const agentName = process?.agent.name;
    const isTyping = process?.agent.isTyping || false;

    // Scroll to bottom of logs when they update
    useEffect(() => {
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [logs, messages]);

    // Handle terminate button click
    const handleTerminate = () => {
        terminateProcess(id);
    };

    // Handle form submission
    const handleSubmit = (input: string) => {
        if (input.trim()) {
            sendProcessCommand(id, input);
        }
    };

    // Track click count and timing for single/double click detection
    const clickTimeout = useRef<number | null>(null);
    const clickCount = useRef<number>(0);
    
    // Handle click on process box
    const handleBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Check what was clicked
        const target = e.target as HTMLElement;

        // Check if clicking on input area
        const isClickingInput =
            target.classList.contains('process-input') ||
            !!target.closest('.process-input-container');

        // Check if clicking on header controls
        const isClickingControls =
            target.classList.contains('process-status') ||
            target.classList.contains('process-terminate') ||
            !!target.closest('.process-terminate');

        if (!isClickingInput && !isClickingControls) {
            // Increment click count
            clickCount.current += 1;
            
            // Clear any existing timeout
            if (clickTimeout.current !== null) {
                window.clearTimeout(clickTimeout.current);
            }
            
            // Set timeout to differentiate between single and double clicks
            clickTimeout.current = window.setTimeout(() => {
                // If it was a single click, focus only on this box
                if (clickCount.current === 1) {
                    onFocus(id, 'only-box');
                } 
                // If it was a double click, focus on parent and children
                else if (clickCount.current === 2) {
                    onFocus(id, 'parent-and-children');
                }
                
                // Reset click count
                clickCount.current = 0;
                clickTimeout.current = null;
            }, 300); // 300ms is a common double-click threshold
        }
    };

    return (
        <div className={`process-box card border-0 shadow ${focused ? 'focused' : ''}`}
            onClick={handleBoxClick}>
            <div className="process-box-bg" style={{backgroundColor: colors.bgColor}}>
                <ProcessHeader
                    agentName={agentName}
                    status={status}
                    colors={colors}
                    onTerminate={handleTerminate}
                />

                <div className="process-logs card-body overflow-auto" ref={logsRef}>
                    <MessageList
                        messages={messages}
                        logs={logs}
                        isTyping={isTyping}
                        colors={colors}
                    />
                </div>

                <ProcessInput onSubmit={handleSubmit} />
            </div>
        </div>
    );
};

export default ProcessBox;
