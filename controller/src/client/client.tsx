/**
 * MAGI System Client-Side Application
 * React-based UI for MAGI system
 */
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import App from './js/components/App';
import './css/styles.css';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
	const rootElement = document.getElementById('root');

	if (!rootElement) {
		console.error('Root element not found');
		return;
	}

	const root = createRoot(rootElement);
	root.render(<App/>);
});
