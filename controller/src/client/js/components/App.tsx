import * as React from 'react';
import {SocketProvider} from '../context/SocketContext';
import ProcessGrid from './ProcessGrid';
import CommandHeader from './CommandHeader';
import CenterCommand from './CenterCommand';

const App: React.FC = () => {
	return (
		<SocketProvider>
			<div className="container-fluid px-0">
				<h1 id="fixed-magi-title" className="position-fixed mb-0">Magi</h1>

				{/* Command header (top bar) */}
				<CommandHeader/>

				{/* Center command input */}
				<CenterCommand/>

				{/* Process grid */}
				<ProcessGrid/>
			</div>
		</SocketProvider>
	);
};

export default App;
