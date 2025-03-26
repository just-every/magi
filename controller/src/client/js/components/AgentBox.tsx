import * as React from 'react';
import {useRef, useEffect} from 'react';
import {ClientMessage} from '../context/SocketContext';
import MessageList from "@components/message/MessageList";
import ProcessHeader from "@components/ui/ProcessHeader";

interface AgentBoxProps {
    id: string;
    colors: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
    logs: string;
    agentName: string;
    messages: ClientMessage[];
    isTyping: boolean;
}

const AgentBox: React.FC<AgentBoxProps> = ({
    id,
    colors,
    logs,
    agentName,
    messages,
    isTyping
}) => {
    const logsRef = useRef<HTMLDivElement>(null);
    
    // Track click count and timing for single/double click detection
    const clickTimeout = useRef<number | null>(null);
    const clickCount = useRef<number>(0);

    // Scroll to bottom of logs when they update
    useEffect(() => {
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [logs, messages]);
    
    // Handle click on agent box
    const handleBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Check what was clicked
        const target = e.target as HTMLElement;

        // Check if clicking on header controls or not an interactive area
        const isClickingControls =
            target.classList.contains('process-status') ||
            !!target.closest('.process-terminate');

        if (!isClickingControls) {
            // Increment click count
            clickCount.current += 1;
            
            // Clear any existing timeout
            if (clickTimeout.current !== null) {
                window.clearTimeout(clickTimeout.current);
            }
            
            // Set timeout to differentiate between single and double clicks
            // For agents, this would either focus on the parent process + this agent
            // or only on this agent
            clickTimeout.current = window.setTimeout(() => {
                // Reset click count after handling
                clickCount.current = 0;
                clickTimeout.current = null;
                
                // Implement event bubbling to parent when needed
                // Currently as a placeholder since we need to connect to the parent process
            }, 300);
        }
    };

    return (
        <div className="process-box agent-box card border-0 shadow" onClick={handleBoxClick}>
            <div className="process-box-bg" style={{backgroundColor: colors.bgColor}}>
                <ProcessHeader
                    agentName={agentName}
                    colors={colors}
                />

                <div className="process-logs card-body overflow-auto" ref={logsRef}>
                    <MessageList
                        messages={messages}
                        logs={logs}
                        isTyping={isTyping}
                        colors={colors}
                    />
                </div>
            </div>
        </div>
    );
};

export default AgentBox;
