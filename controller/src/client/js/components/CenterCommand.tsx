import * as React from 'react';
import {useState, useRef, useEffect} from 'react';
import {useSocket} from '../context/SocketContext';

const CenterCommand: React.FC = () => {
	const {runCommand, isFirstProcess} = useSocket();
	const [command, setCommand] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Focus input when visible
		if (isFirstProcess && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isFirstProcess]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (command.trim()) {
			runCommand(command);
			setCommand('');
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();

			if (command.trim()) {
				runCommand(command);
				setCommand('');
			}
		}
	};

	return (
		<div
			id="center-input-container"
			className="position-absolute top-50 start-50 translate-middle w-75 max-width-md"
			style={{
				display: isFirstProcess ? 'block' : 'none',
				opacity: isFirstProcess ? '1' : '0',
				transition: 'opacity 0.5s ease-out',
				maxWidth: '600px',
				zIndex: 100
			}}
		>
			<form id="center-command-form" onSubmit={handleSubmit}>
				<div className="input-group shadow-sm">
					<span className="input-group-text bg-white">&gt;</span>
					<input
						type="text"
						id="center-command-input"
						className="form-control form-control-lg"
						placeholder="Start task..."
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

export default CenterCommand;
