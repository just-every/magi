import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { SettingsProvider } from './hooks/useSettings';
import { NotificationProvider } from './hooks/useNotifications';

// Pages
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import EditorPage from './pages/EditorPage';
import AboutPage from './pages/AboutPage';

// Components
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import NotificationContainer from './components/NotificationContainer';
import UpdatePrompt from './components/UpdatePrompt';

// Styles
import './styles/App.scss';

export default function App() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  
  // Listen for update events from main process
  useEffect(() => {
    const { on, off } = window.electron;
    
    // Listen for update available
    on.updateAvailable(() => {
      setIsUpdateAvailable(true);
    });
    
    // Cleanup listeners on unmount
    return () => {
      off.updateAvailable();
    };
  }, []);
  
  return (
    <SettingsProvider>
      <ThemeProvider>
        <NotificationProvider>
          <div className="app-container">
            {/* Top navigation bar */}
            <TopBar />
            
            <div className="app-content">
              {/* Sidebar navigation */}
              <Sidebar />
              
              {/* Main content area */}
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/editor" element={<EditorPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
            
            {/* Notification system */}
            <NotificationContainer />
            
            {/* Update prompt */}
            {isUpdateAvailable && <UpdatePrompt />}
          </div>
        </NotificationProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}