/**
 * ProcessInput Component
 * Renders the input field for sending commands to a process
 */
import * as React from 'react';
import { useState, useRef } from 'react';

interface ProcessInputProps {
    onSubmit: (input: string) => void;
}

const ProcessInput: React.FC<ProcessInputProps> = ({ onSubmit }) => {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const inputFormRef = useRef<HTMLFormElement>(null);

    /**
     * Handle form submission
     */
    const handleSubmit = (e: React.FormEvent) => {
        if(e.preventDefault) e.preventDefault();

        if (inputValue.trim()) {
            onSubmit(inputValue);
            setInputValue('');

            // Reset input height after submitting
            if (inputRef.current) {
                inputRef.current.style.height = '40px';
            }
        }
    };

    /**
     * Handle keyboard shortcuts
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Allow shift+enter for newlines
        if (e.key === 'Enter' && e.shiftKey) {
            if(e.preventDefault) e.preventDefault();

            // Insert a newline at cursor position
            const pos = e.currentTarget.selectionStart || 0;
            const value = inputValue;
            setInputValue(value.substring(0, pos) + '\n' + value.substring(pos));

            // Set cursor position after the newline (needs setTimeout to work)
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.selectionStart = inputRef.current.selectionEnd = pos + 1;
                }
            }, 0);
        }
        // Enter without shift submits
        else if (e.key === 'Enter' && !e.shiftKey) {
            if(e.preventDefault) e.preventDefault();
            inputFormRef.current?.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        }
    };

    /**
     * Auto-resize input based on content
     */
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);

        // Reset height to get the right scrollHeight
        e.target.style.height = 'auto';

        // Set new height based on scrollHeight
        const newHeight = Math.min(Math.max(e.target.scrollHeight, 40), 120); // Between 40px and 120px
        e.target.style.height = newHeight + 'px';
    };

    return (
        <div className="process-input-container card-footer bg-transparent p-2 border-0">
            <form className="process-input-form" onSubmit={handleSubmit} ref={inputFormRef}>
                <div className="input-group">
                    <span className="input-group-text">&gt;</span>
                    <input type="text"
                        className="process-input form-control"
                        placeholder="Send reply..."
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        ref={inputRef}
                        autoComplete="off"/>
                </div>
            </form>
        </div>
    );
};

export default ProcessInput;
