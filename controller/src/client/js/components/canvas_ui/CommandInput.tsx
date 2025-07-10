import * as React from 'react';
import { useState, useRef, useEffect, CSSProperties } from 'react';
import { useSocket, ProcessData } from '../../context/SocketContext';
import { TRANSITION_EASE, TRANSITION_TIME } from '../../utils/constants';
import TextareaAutosize from 'react-textarea-autosize';

const CommandInput: React.FC = () => {
    const { runCommand, sendCoreCommand, processes, coreProcessId } =
        useSocket();
    const [command, setCommand] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef(null); // Ref to get element height
    const [isFirstProcess, setIsFirstProcess] = useState(processes.size === 0);
    const [isMultiline, setIsMultiline] = useState(false);

    const coreProcess: ProcessData | undefined = coreProcessId
        ? processes.get(coreProcessId)
        : undefined;

    const agentName =
        coreProcess?.agent?.name && !coreProcess.agent.name.startsWith('AI-')
            ? coreProcess.agent.name
            : '';

    useEffect(() => {
        // Focus input when visible
        if (isFirstProcess && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isFirstProcess]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isFirstProcess && processes.size > 0) {
                setIsFirstProcess(false);
            } else if (!isFirstProcess && processes.size === 0) {
                setIsFirstProcess(true);
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [isFirstProcess, processes.size]);

    // Check if content is multiline
    useEffect(() => {
        setIsMultiline(command.includes('\n'));
    }, [command]);

    const handleSubmit = (e: React.FormEvent) => {
        if (e.preventDefault) e.preventDefault();

        if (command.trim()) {
            // Always create structured content
            const content = [
                {
                    type: 'input_text',
                    text: command.trim(),
                },
            ];

            const messageContent = JSON.stringify({ contentArray: content });

            if (isFirstProcess) {
                // If there are no processes yet, create a new one
                runCommand(messageContent);
            } else {
                // Otherwise, send to the core process
                if (coreProcessId) {
                    sendCoreCommand(messageContent);
                } else {
                    // Fallback to creating a new process if somehow there's no core process
                    runCommand(messageContent);
                }
            }
            setCommand('');
            setIsMultiline(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter without shift submits the form
        if (e.key === 'Enter' && !e.shiftKey) {
            if (e.preventDefault) e.preventDefault();
            handleSubmit(e);
        }
    };

    // Calculate bottom position using top
    const commonStyles: CSSProperties = {
        width: '75%',
        maxWidth: '600px',
        zIndex: 100,
        opacity: '1',
        transition: `bottom ${TRANSITION_TIME}ms ${TRANSITION_EASE}, transform ${TRANSITION_TIME}ms ${TRANSITION_EASE}`,
    };

    const centerStyle: CSSProperties = {
        position: 'fixed',
        left: '50%',
        bottom: '50%',
        transform: 'translate(-50%, 50%)', // Center vertically and horizontally
        ...commonStyles,
    };

    const bottomStyle: CSSProperties = {
        position: 'fixed',
        left: '50%',
        bottom: '1rem',
        transform: 'translate(-50%, 0%)', // Center horizontally only
        ...commonStyles,
    };

    return (
        <div
            id="center-input-container"
            ref={containerRef}
            style={isFirstProcess ? centerStyle : bottomStyle}
        >
            <form id="center-command-form" onSubmit={handleSubmit}>
                <div className="input-group shadow-sm">
                    <span className="input-group-text bg-white">&gt;</span>
                    <TextareaAutosize
                        id="center-command-input"
                        className={`form-control form-control-lg py-2 ${isMultiline ? 'multiline' : ''}`}
                        placeholder={
                            isFirstProcess
                                ? 'Start task...'
                                : `Talk${agentName ? ' to ' + agentName : ''}...`
                        }
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        ref={inputRef}
                        autoComplete="off"
                        minRows={1}
                        maxRows={6}
                        style={{
                            resize: 'none',
                            overflow: 'hidden',
                            paddingTop: isMultiline ? '0.75rem' : 'inherit',
                            paddingBottom: isMultiline ? '0.75rem' : 'inherit',
                            lineHeight: '1.5',
                        }}
                    />
                </div>
            </form>
        </div>
    );
};

export default CommandInput;
