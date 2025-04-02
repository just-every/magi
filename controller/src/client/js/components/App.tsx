import * as React from 'react';
import {useState, useEffect} from 'react';
import {SocketProvider} from '../context/SocketContext';
import ProcessGrid from './ProcessGrid';
import CommandInput from './CommandInput';
import LogsViewer from './LogsViewer';
import CostDisplay from './ui/CostDisplay';
import { AudioPlayer } from '../utils/AudioUtils';

const App: React.FC = () => {
	const [showLogs, setShowLogs] = useState<boolean>(false);
	const [activeProcess, setActiveProcess] = useState<string>('');

	useEffect(() => {
		// Define the handler function
		const initializeAudioGlobally = () => {
			console.log("First user interaction detected anywhere on the page. Initializing AudioContext...");
			AudioPlayer.getInstance().initAudioContext();
			// Note: No need to remove the listener if using { once: true }
		};

		// Add the event listener to the document body or window
		// Use { once: true } so it automatically cleans itself up after the first trigger
		document.addEventListener('click', initializeAudioGlobally, { once: true });
		document.addEventListener('keydown', initializeAudioGlobally, { once: true });
		// Add more event types if needed (e.g., 'touchstart')

		console.log("Global AudioContext initialization listeners attached.");

		// No explicit cleanup needed here because of { once: true }
		// If not using { once: true }, you would need a cleanup function:
		// return () => {
		//     document.removeEventListener('click', initializeAudioGlobally);
		//     document.removeEventListener('keydown', initializeAudioGlobally);
		// };

	}, []); // Empty dependency array ensures this effect runs only once when the component mounts


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

				{/* Cost display */}
				<CostDisplay />

				{/* Main command input */}
				<CommandInput/>

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
