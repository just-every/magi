import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/app.scss';

// ESBuild Hot Reload for dev environment only
if (process.env.NODE_ENV === 'development') {
	new EventSource('/esbuild').addEventListener('change', () => location.reload());
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);