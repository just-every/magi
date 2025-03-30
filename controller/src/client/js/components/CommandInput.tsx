import * as React from 'react';
import {useState, useRef, useEffect, CSSProperties} from 'react';
import {useSocket} from '../context/SocketContext';
import {TRANSITION_EASE, TRANSITION_TIME} from "../constants";

const CommandInput: React.FC = () => {
	const {runCommand, sendCoreCommand, processes, coreProcessId} = useSocket();
	const [command, setCommand] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef(null); // Ref to get element height
	const [isFirstProcess, setIsFirstProcess] = useState(processes.size === 0);

	const coreProcess = Array.from(processes.values()).find((process) => process.id === coreProcessId);
	const agentName = coreProcess?.agent.name && !coreProcess.agent.name.startsWith('AI-') ? coreProcess?.agent.name : '';

	useEffect(() => {
		// Focus input when visible
		if (isFirstProcess && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isFirstProcess]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if(isFirstProcess && processes.size > 0) {
				setIsFirstProcess(false);
			}
			else if(!isFirstProcess && processes.size === 0) {
				setIsFirstProcess(true);
			}
		}, 100);

		return () => clearTimeout(timer);
	}, [isFirstProcess, processes.size]);

	const handleSubmit = (e: React.FormEvent) => {
		if(e.preventDefault) e.preventDefault();

		if (command.trim()) {
			if (isFirstProcess) {
				// If there are no processes yet, create a new one
				runCommand(command);
			} else {
				// Otherwise, send to the core process
				if (coreProcessId) {
					sendCoreCommand(command);
				} else {
					// Fallback to creating a new process if somehow there's no core process
					runCommand(command);
				}
			}
			setCommand('');
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			if(e.preventDefault) e.preventDefault();
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
					<input
						type="text"
						id="center-command-input"
						className="form-control form-control-lg"
						placeholder={isFirstProcess ? "Start task..." : `Talk${agentName ? ' to '+agentName : ''}...`}
						value={command}
						onChange={(e) => setCommand(e.target.value)}
						onKeyDown={handleKeyDown}
						ref={inputRef}
						autoComplete="off"
					/>
				</div>
			</form>
		</div>
	);
};

export default CommandInput;
