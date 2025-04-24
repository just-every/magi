import * as React from 'react';
import { useRef, useEffect, useState } from 'react';
import { ClientMessage } from '../../context/SocketContext';
import MessageList from '../message/MessageList';
import ProcessHeader from '../ui/ProcessHeader';
import { ProcessStatus, ScreenshotEvent } from '../../../../types/shared-types';
import AutoScrollContainer from '../ui/AutoScrollContainer';
import BrowserAgentCard from '../ui/BrowserAgentCard';

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
    screenshots?: ScreenshotEvent[];
}

interface AgentBoxWithParentProcess extends AgentBoxProps {
    parentProcessId?: string;
    onFocusAgent?: (
        agentId: string,
        parentProcessId: string,
        focusMode: 'parent-and-children' | 'only-box'
    ) => void;
}

const AgentBox: React.FC<AgentBoxWithParentProcess> = ({
    id,
    status,
    colors,
    agentName,
    messages,
    isTyping,
    parentProcessId,
    onFocusAgent,
    screenshots,
}) => {
    const clickTimeout = useRef<number | null>(null);
    const clickCount = useRef<number>(0);
    const [mounted, setMounted] = useState(false);

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
            } else {
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
        <div
            className={`process-box agent-box card border-0 shadow ${mounted && status !== 'terminated' && status !== 'completed' ? 'mounted' : ''}`}
            onClick={handleBoxClick}
        >
            <div
                className="process-box-bg"
                style={{ backgroundColor: colors.bgColor }}
            >
                <ProcessHeader agentName={agentName} colors={colors} />

                {screenshots && screenshots.length > 0 && (
                    <BrowserAgentCard screenshots={screenshots} />
                )}

                <AutoScrollContainer
                    className="process-logs card-body"
                >
                    <MessageList
                        messages={messages}
                        isTyping={isTyping}
                        colors={colors}
                    />
                </AutoScrollContainer>
            </div>
        </div>
    );
};

export default AgentBox;
