import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useSettings } from '../hooks/useSettings';
import { useNotifications } from '../hooks/useNotifications';
import '../styles/HomePage.scss';

// Dummy recent files for the template
const RECENT_FILES = [
  { id: 1, name: 'Project Notes.txt', path: '/Users/username/Documents/notes.txt', lastOpened: '2023-05-10T14:30:00' },
  { id: 2, name: 'Meeting Minutes.md', path: '/Users/username/Documents/minutes.md', lastOpened: '2023-05-09T10:15:00' },
  { id: 3, name: 'Ideas.txt', path: '/Users/username/Documents/ideas.txt', lastOpened: '2023-05-08T16:45:00' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { addNotification } = useNotifications();
  const [appInfo, setAppInfo] = useState<any>(null);
  
  // Fetch app info from main process on component mount
  useEffect(() => {
    const fetchAppInfo = async () => {
      try {
        const info = await window.electron.invoke.getAppInfo();
        setAppInfo(info);
      } catch (error) {
        console.error('Failed to fetch app info:', error);
      }
    };
    
    fetchAppInfo();
  }, []);
  
  // Handle new file creation
  const handleNewFile = () => {
    navigate('/editor');
  };
  
  // Handle file open
  const handleOpenFile = async () => {
    try {
      const result = await window.electron.invoke.openFile();
      
      if (result) {
        // Store the file data in session storage
        sessionStorage.setItem('currentFile', JSON.stringify(result));
        navigate('/editor');
      }
    } catch (error) {
      console.error('Error opening file:', error);
      addNotification({
        title: 'Error',
        message: 'Failed to open file',
        type: 'error',
      });
    }
  };
  
  // Handle recent file click
  const handleRecentFileClick = (file: any) => {
    // In a real app, this would load the file content
    addNotification({
      title: 'File Selected',
      message: `Opening ${file.name}`,
      type: 'info',
    });
    navigate('/editor');
  };
  
  return (
    <div className="home-page">
      <section className="welcome-section">
        <h1>Welcome to Electron Desktop App</h1>
        <p>A cross-platform desktop application template built with Electron and React</p>
        
        {appInfo && (
          <div className="app-info">
            <p>Version: {appInfo.version}</p>
            <p>Platform: {appInfo.platform}</p>
            <p>Electron: {appInfo.electronVersion}</p>
          </div>
        )}
        
        <div className="action-buttons">
          <Button onClick={handleNewFile} variant="primary">
            Create New File
          </Button>
          <Button onClick={handleOpenFile} variant="secondary">
            Open Existing File
          </Button>
        </div>
      </section>
      
      <section className="recent-files">
        <h2>Recent Files</h2>
        
        {RECENT_FILES.length > 0 ? (
          <div className="files-grid">
            {RECENT_FILES.map((file) => (
              <Card
                key={file.id}
                title={file.name}
                description={file.path}
                footer={`Last opened: ${new Date(file.lastOpened).toLocaleDateString()}`}
                onClick={() => handleRecentFileClick(file)}
              />
            ))}
          </div>
        ) : (
          <p className="no-files">No recent files</p>
        )}
      </section>
    </div>
  );
}