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
    colors,
    logs,
    agentName,
    messages,
    isTyping
}) => {
    const logsRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom of logs when they update
    useEffect(() => {
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [logs, messages]);

    return (
        <div className="process-box agent-box card border-0 shadow">
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
