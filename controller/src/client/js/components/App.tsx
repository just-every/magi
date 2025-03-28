import * as React from 'react';
import {useState} from 'react';
import {SocketProvider} from '../context/SocketContext';
import ProcessGrid from './ProcessGrid';
import CommandHeader from './CommandHeader';
import CenterCommand from './CenterCommand';
import LogsViewer from './LogsViewer';

const App: React.FC = () => {
	const [showLogs, setShowLogs] = useState<boolean>(false);
	const [activeProcess, setActiveProcess] = useState<string>('');
	
	const toggleLogsViewer = (processId?: string) => {
		if (processId) {
			setActiveProcess(processId);
			setShowLogs(true);
		} else {
			setShowLogs(!showLogs);
		}
	};
	
	return (
		<SocketProvider>
			<div className="container-fluid px-0">
				<h1 
					id="fixed-magi-title" 
					className="position-fixed mb-0"
					onClick={() => toggleLogsViewer()}
					style={{ cursor: 'pointer' }}
				>
					Magi
				</h1>

				{/* Command header (top bar) */}
				<CommandHeader/>

				{/* Center command input */}
				<CenterCommand/>

				{/* Process grid */}
				<ProcessGrid onProcessSelect={toggleLogsViewer}/>
				
				{/* Logs viewer (hidden by default) */}
				{showLogs && (
					<LogsViewer 
						processId={activeProcess} 
						onClose={() => setShowLogs(false)}
					/>
				)}
			</div>
		</SocketProvider>
	);
};

export default App;
