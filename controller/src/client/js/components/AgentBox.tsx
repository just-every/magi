import * as React from 'react';
import {useRef, useEffect, useState} from 'react';
import {ClientMessage} from '../context/SocketContext';
import MessageList from "@components/message/MessageList";
import ProcessHeader from "@components/ui/ProcessHeader";
import {ProcessStatus} from "@types";

interface AgentBoxProps {
    id: string;
    status: ProcessStatus;
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

interface AgentBoxWithParentProcess extends AgentBoxProps {
    parentProcessId?: string;
    onFocusAgent?: (agentId: string, parentProcessId: string, focusMode: 'parent-and-children' | 'only-box') => void;
}

const AgentBox: React.FC<AgentBoxWithParentProcess> = ({
    id,
    status,
    colors,
    logs,
    agentName,
    messages,
    isTyping,
    parentProcessId,
    onFocusAgent
}) => {
    const logsRef = useRef<HTMLDivElement>(null);
    const clickTimeout = useRef<number | null>(null);
    const clickCount = useRef<number>(0);
    const [mounted, setMounted] = useState(false);

    // Scroll to bottom of logs when they update
    useEffect(() => {
        if (logsRef.current) {
            // Calculate how close to the bottom we are
            const { scrollTop, scrollHeight, clientHeight } = logsRef.current;
            const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50; // Within 50px of bottom

            // Only auto-scroll if already near the bottom
            if (isNearBottom) {
                logsRef.current.scrollTop = logsRef.current.scrollHeight;
            }
        }
    }, [logs, messages]);

    // Effect to handle mount animation
    useEffect(() => {
        setMounted(true);
    }, []);

    // Handle click on agent box
    const handleBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Check what was clicked
        const target = e.target as HTMLElement;

        // Check if clicking on header controls or not an interactive area
        const isClickingControls =
            target.classList.contains('process-status') ||
            !!target.closest('.process-btn');

        if (!isClickingControls) {
            // Increment click count
            clickCount.current += 1;

            // Clear any existing timeout
            if (clickTimeout.current !== null) {
                window.clearTimeout(clickTimeout.current);
            }

            if (clickCount.current === 1) {
                // Add a brief delay to allow for a double click event
                clickTimeout.current = window.setTimeout(() => {
                    // Single click - focus only on this agent box
                    onFocusAgent(id, parentProcessId, 'only-box');

                    // Add some extra time to detect double clicks
                    clickTimeout.current = window.setTimeout(() => {
                        // Reset click count after handling
                        clickCount.current = 0;
                        clickTimeout.current = null;
                    }, 300);
                }, 200);
            }
            else {
                if (clickCount.current === 2) {
                    // Double click - focus on parent and all children
                    onFocusAgent(id, parentProcessId, 'parent-and-children');
                }

                // Clear after 1 second to allow next event
                clickTimeout.current = window.setTimeout(() => {
                    // Reset click count after handling
                    clickCount.current = 0;
                    clickTimeout.current = null;
                }, 500);
            }

            // Stop event propagation to prevent bubbling
            e.stopPropagation();
        }
    };

    return (
        <div className={`process-box agent-box card border-0 shadow ${mounted && status !== 'terminated' && status !== 'completed' ? 'mounted' : ''}`} onClick={handleBoxClick}>
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
