# M(ostly) A(utonomous) G(enerative) I(ntelligence) System

The Magi System is optimized for large scale programming tasks. Multiple AI agents work simultaneously time towards multiple goals. It is self-updating with the goal of becoming largely autonomous. 

## Features

- Create multiple process boxes with split-screen layout
- Each process has its own input box
- Grid layout adjusts based on number of processes
- Keyboard shortcuts for navigation and control

## Installation

```
# Create a virtual environment
python -m venv venv

# Activate the virtual environment
source venv/bin/activate  # On Unix/Mac
venv\Scripts\activate     # On Windows

# Install dependencies
pip install -r requirements.txt
```

## Usage

```
# Run the application
python main.py

# Run in test mode (spawns test processes)
python main.py -t

# Run with a specific prompt
python main.py -p "your command"
```

## Keyboard Shortcuts

- `Tab`: Focus next input box
- `Shift+Tab`: Focus previous input box
- `q` or `Escape`: Quit the application (with confirmation)
- `Ctrl+c`: Force quit immediately (without confirmation)
- `Ctrl+d`: Quit with confirmation
- `Ctrl+p`: Open command palette

## Input

- Bottom input spawns new processes
- Each process box has its own input field
- Click on a process box to focus its input
