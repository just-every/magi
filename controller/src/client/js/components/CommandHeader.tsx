import * as React from 'react';
import {useState, useRef} from 'react';
import {useSocket} from '../context/SocketContext';

const CommandHeader: React.FC = () => {
	const {runCommand, isFirstProcess} = useSocket();
	const [command, setCommand] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

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
		<header
			id="main-header"
			className="py-3 pt-4"
			style={{
				opacity: isFirstProcess ? '0' : '1',
				transform: isFirstProcess ? 'translateY(-100%)' : 'translateY(0)',
				transition: 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
				position: 'relative',
				zIndex: 100
			}}
		>
			<div className="container-fluid px-3">
				<div className="d-flex align-items-center">
					<form id="command-form" className="mx-auto" style={{maxWidth: '1000px', width: '100%'}}
						  onSubmit={handleSubmit}>
						<div className="input-group shadow-sm">
							<span className="input-group-text bg-white">&gt;</span>
							<input
								type="text"
								id="command-input"
								className="form-control"
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
			</div>
		</header>
	);
};

export default CommandHeader;
