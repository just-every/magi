import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import AutoScrollContainer from '../ui/AutoScrollContainer';
import { ProcessData, ToolCallMessage } from '../../context/SocketContext';
import { GlobalCostData } from '../../../../types';
import CollapsibleSection from './CollapsibleSection';
import { useSocket } from '../../context/SocketContext'; // Import useSocket
import TextareaAutosize from 'react-textarea-autosize'; // Import TextareaAutosize
import CostDisplay from '../ui/CostDisplay'; // Import CostDisplay
import StatusDisplay from '../ui/StatusDisplay'; // Import StatusDisplay
import { parseMarkdown } from '../utils/MarkdownUtils';
import { AudioPlayer, fadeOutAndStopAudio } from '../../utils/AudioUtils';
import MessageContent from '../ui/MessageContent';
import { VersionManager } from '../ui/VersionManager';
import { AudioRecorder } from '../../utils/AudioRecorder';
import AudioVisualizer from '../ui/AudioVisualizer';

interface VoiceOption {
    id: string;
    name: string;
    provider: 'openai' | 'elevenlabs' | 'gemini';
    description?: string;
}

// Helper function to check if a URL points to an image
// const isImageUrl = (url: string): boolean => {
//     try {
//         // Basic check for common image extensions
//         const pathname = new URL(url).pathname.toLowerCase();
//         return /\.(jpg|jpeg|png|gif|webp|svg)$/.test(pathname);
//     } catch (e) {
//         // If URL parsing fails or it doesn't have a recognized extension, treat as non-image
//         return false;
//     }
// };

interface ChatColumnProps {
    processes: Map<string, ProcessData>;
    coreProcessId: string | null;
    costData: GlobalCostData | null;
    isPaused: boolean;
    togglePauseState: () => void;
}

const ChatColumn: React.FC<ChatColumnProps> = ({
    processes,
    coreProcessId,
    costData,
    isPaused,
    togglePauseState,
}) => {
    const {
        socket,
        sendCoreCommand,
        runCommand,
        isAudioEnabled,
        toggleAudioState,
        isTelegramEnabled,
        toggleTelegramState,
    } = useSocket(); // Get sendCoreCommand, runCommand, and toggle controls
    const [command, setCommand] = useState('');
    const [isMultiline, setIsMultiline] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isFirstProcess, setIsFirstProcess] = useState(processes.size === 0);
    const [voices, setVoices] = useState<VoiceOption[]>([]);
    const [currentVoiceId, setCurrentVoiceId] = useState<string>('');
    const [isLoadingVoices, setIsLoadingVoices] = useState(false);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [inputFocus, setInputFocus] = useState(false);
    const [showVersionManager, setShowVersionManager] =
        useState<boolean>(false);
    const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(
        new Map()
    );
    const [isRecording, setIsRecording] = useState(false);
    const [transcriptionText, setTranscriptionText] = useState('');
    const audioRecorderRef = useRef<AudioRecorder | null>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [audioSource, setAudioSource] =
        useState<MediaStreamAudioSourceNode | null>(null);

    const coreProcess = coreProcessId
        ? (processes.get(coreProcessId) as ProcessData | undefined)
        : null;
    const agentName =
        coreProcess?.agent?.name && !coreProcess.agent.name.startsWith('AI-')
            ? coreProcess.agent.name
            : '';

    useEffect(() => {
        // Focus input when visible
        if (isFirstProcess && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isFirstProcess]);

    // Fetch available voices
    useEffect(() => {
        const fetchVoices = async () => {
            setIsLoadingVoices(true);
            try {
                const response = await fetch('/api/voices');
                const data = await response.json();
                if (data.success) {
                    setVoices(data.voices);
                    setCurrentVoiceId(data.currentVoice);
                }
            } catch (error) {
                console.error('Failed to fetch voices:', error);
            } finally {
                setIsLoadingVoices(false);
            }
        };
        fetchVoices();
    }, []);

    // Handle voice change
    const handleVoiceChange = async (voiceId: string) => {
        try {
            // Ensure AudioContext is initialized before playing preview
            await AudioPlayer.getInstance().initAudioContext();

            // First, update the current voice
            const response = await fetch('/api/voices/current', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ voiceId }),
            });
            const data = await response.json();
            if (data.success) {
                setCurrentVoiceId(voiceId);

                // Then, play a preview of the new voice
                try {
                    setIsPlayingPreview(true);
                    const previewResponse = await fetch('/api/voices/preview', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ voiceId }),
                    });
                    const previewData = await previewResponse.json();
                    if (!previewData.success) {
                        console.error(
                            'Failed to preview voice:',
                            previewData.error
                        );
                    }
                    // Preview audio will play for a short time
                    setTimeout(() => setIsPlayingPreview(false), 3000);
                } catch (previewError) {
                    console.error('Error playing voice preview:', previewError);
                    setIsPlayingPreview(false);
                    // Don't fail the voice change if preview fails
                }
            }
        } catch (error) {
            console.error('Failed to update voice:', error);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isFirstProcess && processes.size > 0) {
                setIsFirstProcess(false);
            } else if (!isFirstProcess && processes.size === 0) {
                setIsFirstProcess(true);
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [isFirstProcess, processes.size]);

    // Filter messages to only show talk_to_* results and user messages
    const messages =
        coreProcess?.agent?.messages.filter(msg => {
            // Always keep user messages
            if (msg.type === 'user') return true;

            // For tool results, only keep talk_to_* results
            if (
                msg.type === 'tool_call' &&
                (msg as ToolCallMessage).toolName.startsWith('talk_to_')
            ) {
                return true;
            }

            return false;
        }) || [];

    // Format cost to two decimal places
    const formatCost = (cost: number) => {
        return `$${cost.toFixed(2)}`;
    };

    // Extract cost values safely
    const totalCost = costData?.usage?.cost?.total || 0;
    const costPerMin = costData?.costPerMinute || 0;

    // Check if content is multiline
    useEffect(() => {
        setIsMultiline(command.includes('\n'));
    }, [command]);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e && e.preventDefault) e.preventDefault();

        if (command.trim() || attachedFiles.length > 0) {
            // Always create structured content
            const content = [];

            // Add text content if any
            const textContent = command.trim();
            if (textContent) {
                content.push({
                    type: 'input_text',
                    text: textContent,
                });
            }

            // Handle file attachments if any
            if (attachedFiles.length > 0) {
                // Upload files first
                const uploadedFiles = await uploadFiles(attachedFiles);

                // Add file/image content
                for (const fileInfo of uploadedFiles) {
                    if (fileInfo.type.startsWith('image/')) {
                        content.push({
                            type: 'input_image',
                            detail: 'high',
                            image_url: fileInfo.url,
                        });
                    } else {
                        content.push({
                            type: 'input_file',
                            filename: fileInfo.filename,
                            file_id: fileInfo.fileId,
                        });
                    }
                }
            }

            // Always send as structured content
            const messageContent = JSON.stringify({ contentArray: content });

            if (coreProcessId) {
                sendCoreCommand(messageContent); // Send to existing core process
            } else {
                // If somehow no core process exists, maybe start a new one?
                // Or display an error? For now, let's try starting one.
                console.warn(
                    'No core process found, attempting to start a new one with the command.'
                );
                runCommand(messageContent);
            }
            setCommand('');
            setAttachedFiles([]);
            setIsMultiline(false);
            if (inputRef.current) {
                inputRef.current.style.height = 'auto'; // Reset height after submit
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter without shift submits the form
        if (e.key === 'Enter' && !e.shiftKey) {
            if (e.preventDefault) e.preventDefault();
            handleSubmit(e);
        }
    };

    // File upload handlers
    const uploadFiles = async (
        files: File[]
    ): Promise<
        Array<{ url: string; filename: string; fileId: string; type: string }>
    > => {
        const uploadedFiles = [];

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                setUploadProgress(prev => new Map(prev).set(file.name, 0));

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (response.ok) {
                    const data = await response.json();
                    uploadedFiles.push({
                        url: data.url,
                        filename: file.name,
                        fileId: data.fileId,
                        type: file.type,
                    });
                }

                setUploadProgress(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(file.name);
                    return newMap;
                });
            } catch (error) {
                console.error('Error uploading file:', error);
                setUploadProgress(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(file.name);
                    return newMap;
                });
            }
        }

        return uploadedFiles;
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setAttachedFiles(prev => [...prev, ...files]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeFile = (index: number) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    // Audio recording handlers
    const handleAudioToggle = async () => {
        if (!socket) return;

        if (isRecording) {
            // Stop recording
            setIsRecording(false);
            setTranscriptionText('');

            // Stop the recorder which will handle disconnecting audio nodes
            if (audioRecorderRef.current) {
                audioRecorderRef.current.stop();
                audioRecorderRef.current = null;
            }

            // Clear audio states after recorder is stopped
            setAudioContext(null);
            setAudioSource(null);

            socket.emit('audio:stream_stop');
        } else {
            // Start recording
            try {
                const recorder = new AudioRecorder({
                    sampleRate: 16000,
                    channelCount: 1,
                    onDataAvailable: data => {
                        // Send audio data to server
                        socket.emit('audio:stream_data', {
                            audio: data,
                        });
                    },
                    onError: error => {
                        console.error('Audio recording error:', error);
                        setIsRecording(false);
                    },
                });

                audioRecorderRef.current = recorder;
                await recorder.start();

                // Get audio context and source for visualization
                const ctx = recorder.getAudioContext();
                const src = recorder.getSource();
                setAudioContext(ctx);
                setAudioSource(src);

                // Notify server that we're starting
                socket.emit('audio:stream_start', {
                    sampleRate: 16000,
                    model: 'gemini-live-2.5-flash-preview',
                    language: 'en',
                });

                setIsRecording(true);
            } catch (error) {
                console.error('Failed to start recording:', error);
                alert(
                    'Failed to access microphone. Please check your permissions.'
                );
            }
        }
    };

    // Set up socket event listeners for transcription
    useEffect(() => {
        if (!socket) return;

        const handleTranscriptionEvent = (data: {
            type: string;
            event: {
                type: string;
                delta?: string;
                text?: string;
                error?: string;
            };
        }) => {
            if (data.type !== 'transcription_event') return;

            const event = data.event;

            switch (event.type) {
                case 'transcription_start':
                    console.log('Transcription started');
                    setTranscriptionText('');
                    break;

                case 'transcription_turn_delta':
                    if (event.delta) {
                        // Append preview delta to existing text
                        setTranscriptionText(prev => prev + event.delta);
                    }
                    break;

                case 'transcription_turn_complete':
                    if (event.text && event.text.trim()) {
                        const textContent = event.text.trim();

                        // Create structured content
                        const content = [
                            {
                                type: 'input_text',
                                text: textContent,
                            },
                        ];

                        const messageContent = JSON.stringify({
                            contentArray: content,
                        });

                        // Submit directly without going through handleSubmit
                        if (coreProcessId) {
                            sendCoreCommand(messageContent);
                        } else {
                            console.warn(
                                'No core process found, attempting to start a new one with the command.'
                            );
                            runCommand(messageContent);
                        }

                        // Clear the command after submission
                        setCommand('');
                    }
                    setTranscriptionText('');
                    // Don't stop recording - let user control this
                    break;

                case 'vad_speech_start':
                    console.log('Speech detected');
                    // Fade out any ongoing audio playback when user starts speaking
                    fadeOutAndStopAudio(150);
                    break;

                case 'vad_speech_end':
                    console.log('Speech ended');
                    break;

                case 'error':
                    console.error('Transcription error:', event.error);
                    setIsRecording(false);
                    audioRecorderRef.current?.stop();
                    break;
            }
        };

        const handleAudioError = (data: {
            error: string;
            details?: string;
        }) => {
            console.error('Audio error:', data.error, data.details);
            setIsRecording(false);
            audioRecorderRef.current?.stop();
        };

        socket.on('audio:transcription_event', handleTranscriptionEvent);
        socket.on('audio:error', handleAudioError);

        return () => {
            socket.off('audio:transcription_event', handleTranscriptionEvent);
            socket.off('audio:error', handleAudioError);
        };
    }, [socket, coreProcessId, sendCoreCommand, runCommand]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            audioRecorderRef.current?.stop();
        };
    }, []);

    // Drag and drop handlers
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        setAttachedFiles(prev => [...prev, ...files]);
    };

    return (
        <div
            className="chat-column h-100 d-flex flex-column overflow-scroll"
            style={{ padding: '0.5rem' }}
        >
            {/* Status Section */}
            <CollapsibleSection
                title="Status"
                className="pe-2"
                collapsedSummary={
                    <>
                        {!isPaused && !isFirstProcess && isAudioEnabled && (
                            <i
                                className={
                                    'bi bi-volume-up-fill text-primary me-3'
                                }
                            />
                        )}
                        {!isPaused && !isFirstProcess && isTelegramEnabled && (
                            <i className={'bi bi-telegram text-primary me-3'} />
                        )}
                        <i
                            className={'bi bi-circle-fill me-3'}
                            style={{
                                color: isPaused
                                    ? '#00000'
                                    : isFirstProcess
                                      ? '#28a745'
                                      : 'var(--accent-primary)',
                            }}
                        />
                        {isPaused
                            ? 'Paused'
                            : isFirstProcess
                              ? 'Ready'
                              : 'Running'}
                    </>
                }
            >
                <div className="status-details">
                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <span className="fw-bold me-2">Status:</span>
                            <span>
                                <i
                                    className={`bi bi-circle-fill mx-2 ${isPaused ? 'text-dark' : isFirstProcess ? 'text-success' : 'text-primary'}`}
                                />
                                {isPaused
                                    ? 'Paused'
                                    : isFirstProcess
                                      ? 'Ready'
                                      : 'Running'}
                            </span>
                        </div>
                        <button
                            className={`btn btn-sm ${isPaused ? 'btn-primary text-white' : 'btn-light'}`}
                            onClick={togglePauseState}
                        >
                            <i
                                className={`me-1 bi ${isPaused ? 'bi-play-fill' : 'bi-pause-fill'}`}
                            />{' '}
                            {isPaused ? 'Resume' : 'Pause'}
                        </button>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <span className="fw-bold me-2">Voice:</span>
                            <span>
                                <i
                                    className={`bi ${isAudioEnabled ? 'bi-volume-up-fill' : 'bi-x'} mx-2 ${isAudioEnabled ? 'text-primary' : 'text-dark'}`}
                                />
                                {isAudioEnabled
                                    ? isPlayingPreview
                                        ? 'Playing Preview...'
                                        : 'Active'
                                    : 'Muted'}
                            </span>
                        </div>
                        <button
                            className={`btn btn-sm ${!isAudioEnabled ? 'btn-primary text-white' : 'btn-light'}`}
                            onClick={toggleAudioState}
                        >
                            <i
                                className={`me-1 bi ${isAudioEnabled ? 'bi-x' : 'bi-volume-up-fill'}`}
                            />{' '}
                            {isAudioEnabled ? 'Mute' : 'Play'}
                        </button>
                    </div>

                    {/* Voice Selection Dropdown */}
                    {isAudioEnabled && (
                        <div className="mt-3">
                            <div className="d-flex align-items-center">
                                {voices.length === 0 && !isLoadingVoices ? (
                                    <span className="text-muted">
                                        No voice providers configured
                                    </span>
                                ) : (
                                    <select
                                        className="form-select form-select-sm"
                                        value={currentVoiceId}
                                        onChange={e =>
                                            handleVoiceChange(e.target.value)
                                        }
                                        onMouseDown={() => {
                                            // Ensure AudioContext is initialized when user interacts with dropdown
                                            AudioPlayer.getInstance().initAudioContext();
                                        }}
                                        disabled={
                                            isLoadingVoices ||
                                            voices.length === 0
                                        }
                                        style={{ maxWidth: '100%' }}
                                    >
                                        {isLoadingVoices ? (
                                            <option>Loading voices...</option>
                                        ) : voices.length === 0 ? (
                                            <option>No voices available</option>
                                        ) : (
                                            <>
                                                {/* Only show optgroups for providers that have voices */}
                                                {voices.some(
                                                    v =>
                                                        v.provider ===
                                                        'elevenlabs'
                                                ) && (
                                                    <optgroup label="ElevenLabs">
                                                        {voices
                                                            .filter(
                                                                v =>
                                                                    v.provider ===
                                                                    'elevenlabs'
                                                            )
                                                            .map(voice => (
                                                                <option
                                                                    key={
                                                                        voice.id
                                                                    }
                                                                    value={
                                                                        voice.id
                                                                    }
                                                                >
                                                                    {voice.name}
                                                                    {voice.description &&
                                                                        ` - ${voice.description}`}
                                                                </option>
                                                            ))}
                                                    </optgroup>
                                                )}
                                                {voices.some(
                                                    v => v.provider === 'gemini'
                                                ) && (
                                                    <optgroup label="Gemini">
                                                        {voices
                                                            .filter(
                                                                v =>
                                                                    v.provider ===
                                                                    'gemini'
                                                            )
                                                            .map(voice => (
                                                                <option
                                                                    key={
                                                                        voice.id
                                                                    }
                                                                    value={
                                                                        voice.id
                                                                    }
                                                                >
                                                                    {voice.name}
                                                                    {voice.description &&
                                                                        ` - ${voice.description}`}
                                                                </option>
                                                            ))}
                                                    </optgroup>
                                                )}
                                                {voices.some(
                                                    v => v.provider === 'openai'
                                                ) && (
                                                    <optgroup label="OpenAI">
                                                        {voices
                                                            .filter(
                                                                v =>
                                                                    v.provider ===
                                                                    'openai'
                                                            )
                                                            .map(voice => (
                                                                <option
                                                                    key={
                                                                        voice.id
                                                                    }
                                                                    value={
                                                                        voice.id
                                                                    }
                                                                >
                                                                    {voice.name}
                                                                    {voice.description &&
                                                                        ` - ${voice.description}`}
                                                                </option>
                                                            ))}
                                                    </optgroup>
                                                )}
                                            </>
                                        )}
                                    </select>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <span className="fw-bold me-2">Telegram:</span>
                            <span>
                                <i
                                    className={`bi ${isTelegramEnabled ? 'bi-telegram' : 'bi-x'} mx-2 ${isTelegramEnabled ? 'text-primary' : 'text-dark'}`}
                                />
                                {isTelegramEnabled ? 'Sending' : 'Muted'}
                            </span>
                        </div>
                        <button
                            className={`btn btn-sm ${!isTelegramEnabled ? 'btn-primary text-white' : 'btn-light'}`}
                            onClick={toggleTelegramState}
                        >
                            <i
                                className={`me-1 bi ${isTelegramEnabled ? 'bi-x' : 'bi-telegram'}`}
                            />{' '}
                            {isTelegramEnabled ? 'Mute' : 'Send'}
                        </button>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <span className="fw-bold me-2">Version:</span>
                            <span>None</span>
                        </div>

                        {/* Version Manager Button */}
                        <button
                            className={'btn btn-sm btn-primary text-white'}
                            onClick={() =>
                                setShowVersionManager(!showVersionManager)
                            }
                        >
                            Manage
                        </button>

                        {/* Version Manager Modal */}
                        <VersionManager
                            isOpen={showVersionManager}
                            onClose={() => setShowVersionManager(false)}
                        />
                    </div>

                    <div className="mt-4">
                        <StatusDisplay />
                    </div>
                </div>
            </CollapsibleSection>

            {/* Cost Section */}
            <CollapsibleSection
                title="Cost"
                className="pe-2"
                collapsedSummary={
                    costData
                        ? `${formatCost(totalCost)} (${formatCost(costPerMin)}/min)`
                        : ''
                }
            >
                {costData ? (
                    <CostDisplay forceExpand={true} />
                ) : (
                    <div className="text-muted">
                        Usage data not yet collected.
                    </div>
                )}
            </CollapsibleSection>

            {/* Messages */}
            <AutoScrollContainer className="chat-messages flex-grow-1 mt-3 pe-2">
                {messages.length > 0 &&
                    messages.map(message => {
                        const toolCallMessage =
                            message.type === 'tool_call'
                                ? (message as ToolCallMessage)
                                : null;

                        let document = null;
                        const media = null;
                        // Check if toolCallMessage exists before accessing its properties
                        if (
                            toolCallMessage &&
                            toolCallMessage.toolParams &&
                            toolCallMessage.toolParams.document
                        ) {
                            document = (
                                <div className={'mt-2'}>
                                    <div
                                        className={
                                            'd-inline-block p-3 rounded-top-3 bg-white text-black border border-light-subtle rounded-end-3 font-monospace'
                                        }
                                    >
                                        <div
                                            style={{
                                                textAlign: 'left',
                                                fontSize: '0.8em',
                                                backgroundColor:
                                                    'rgb(255 255 255 / 35%) !important',
                                                borderColor:
                                                    'rgb(255 255 255 / 65%) !important',
                                            }}
                                            dangerouslySetInnerHTML={parseMarkdown(
                                                toolCallMessage.toolParams
                                                    .document as string
                                            )}
                                        />
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={message.id} className="mb-4">
                                <div
                                    className={`${message.type === 'user' ? 'text-end' : ''}`}
                                >
                                    <div
                                        className={`d-inline-block p-3 pb-0 rounded-top-3 ${
                                            message.type === 'user'
                                                ? 'bg-primary text-white rounded-start-3'
                                                : 'bg-white rounded-end-3'
                                        }`}
                                        style={{
                                            maxWidth: '85%',
                                            textAlign: 'left',
                                        }}
                                    >
                                        {toolCallMessage ? (
                                            toolCallMessage.command
                                        ) : (
                                            <MessageContent
                                                content={message.content}
                                            />
                                        )}
                                    </div>
                                </div>
                                {document}
                                {media}
                            </div>
                        );
                    })}
            </AutoScrollContainer>

            {/* Chat Input */}
            <div className="mt-auto pt-3">
                <form onSubmit={handleSubmit}>
                    {/* File attachments display */}
                    {attachedFiles.length > 0 && (
                        <div className="mb-2">
                            <div className="d-flex flex-wrap gap-2">
                                {attachedFiles.map((file, index) => (
                                    <div
                                        key={index}
                                        className="badge bg-secondary d-flex align-items-center gap-1"
                                    >
                                        <i
                                            className={`bi ${file.type.startsWith('image/') ? 'bi-image' : 'bi-file-earmark'}`}
                                        ></i>
                                        <span
                                            className="text-truncate"
                                            style={{ maxWidth: '150px' }}
                                        >
                                            {file.name}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-close btn-close-white ms-1"
                                            style={{ fontSize: '0.7rem' }}
                                            onClick={() => removeFile(index)}
                                            aria-label="Remove file"
                                        ></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div
                        className={`${isDragging ? 'border-primary' : ''}`}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.focus()}
                        style={{
                            borderWidth: isDragging ? '2px' : '1px',
                            borderStyle: isDragging ? 'dashed' : 'solid',
                            borderRadius: '0.375rem',
                            transition: 'all 0.2s',
                            backgroundColor: '#fff',
                            borderColor: inputFocus
                                ? 'rgba(var(--bs-primary-rgb))'
                                : '#fff',
                        }}
                    >
                        <div className="d-flex flex-column">
                            <TextareaAutosize
                                id="chat-command-input"
                                className={`form-control chat-col-input py-2 px-3 ${isMultiline ? 'multiline' : ''}`}
                                placeholder={
                                    isDragging
                                        ? 'Drop files here...'
                                        : isRecording && transcriptionText
                                          ? transcriptionText
                                          : isRecording
                                            ? 'Listening...'
                                            : isFirstProcess
                                              ? 'Start task...'
                                              : `Talk${agentName ? ' to ' + agentName : ''}...`
                                }
                                value={command}
                                onChange={e => setCommand(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setInputFocus(true)}
                                onBlur={() => setInputFocus(false)}
                                ref={inputRef}
                                autoComplete="off"
                                minRows={1}
                                maxRows={10}
                                style={{
                                    border: 'none',
                                    resize: 'none',
                                    outline: 'none !important',
                                    boxShadow: 'none',
                                }}
                            />
                            <div className="d-flex flex-row justify-content-between align-items-center gap-2 p-2">
                                {/* Audio Visualizer on the left */}
                                {isRecording && audioContext && audioSource ? (
                                    <div className="flex-grow-1">
                                        <AudioVisualizer
                                            audioContext={audioContext}
                                            source={audioSource}
                                            height={24}
                                            barCount={20}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-grow-1"></div>
                                )}
                                {/* Buttons on the right */}
                                <div className="d-flex flex-row align-items-center gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary border-0 rounded-circle"
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        title="Attach files"
                                    >
                                        <i className="bi bi-paperclip"></i>
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn border-0 rounded-circle ${isRecording ? 'recording-active' : 'btn-outline-secondary'}`}
                                        style={
                                            isRecording
                                                ? { color: '#00a2ff' }
                                                : {}
                                        }
                                        onClick={handleAudioToggle}
                                        title={
                                            isRecording
                                                ? 'Stop recording'
                                                : 'Start voice input'
                                        }
                                    >
                                        <i
                                            className={`bi ${isRecording ? 'bi-stop-circle-fill' : 'bi-soundwave'}`}
                                        ></i>
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn border-0 rounded-circle ms-1 ${isRecording ? 'btn-outline-secondary' : 'btn-primary text-white'}`}
                                        onClick={handleSubmit}
                                        title="Send"
                                    >
                                        <i className="bi bi-send-fill"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                            accept="*/*"
                        />
                    </div>

                    {/* Upload progress indicators */}
                    {uploadProgress.size > 0 && (
                        <div className="mt-2">
                            {Array.from(uploadProgress.entries()).map(
                                ([filename, progress]) => (
                                    <div
                                        key={filename}
                                        className="text-muted small"
                                    >
                                        <i className="bi bi-upload me-1"></i>
                                        Uploading {filename}... {progress}%
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ChatColumn;
