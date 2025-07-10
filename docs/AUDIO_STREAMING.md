# Audio Streaming and Speech-to-Text Integration

This document describes the audio streaming functionality integrated with the MAGI system, using the `ensembleListen` method from the `@just-every/ensemble` package.

## Overview

The system enables real-time speech-to-text (STT) transcription with Voice Activity Detection (VAD) through the soundwave button in the chat interface.

## Architecture

### Client-Side Components

1. **AudioRecorder** (`controller/src/client/js/utils/AudioRecorder.ts`)
   - Captures microphone audio using Web Audio API
   - Converts audio to 16-bit PCM format at 16kHz sample rate
   - Streams audio chunks to the server via WebSocket

2. **ChatColumn Component** 
   - Manages recording state and UI
   - Displays transcription progress
   - Shows visual feedback with pulse animation when recording

### Server-Side Components

1. **Audio Stream Handler** (`controller/src/server/utils/audio_stream_handler.ts`)
   - Manages audio sessions per client
   - Buffers incoming audio data
   - Integrates with `ensembleListen` for transcription

2. **ServerManager WebSocket Routes**
   - `audio:stream_start` - Initiates audio session
   - `audio:stream_data` - Receives audio chunks
   - `audio:stream_stop` - Ends audio session

## Usage

1. Click the soundwave button in the chat input area
2. Allow microphone access when prompted
3. Speak your message - the system will detect speech using VAD
4. The transcribed text will appear in the input field
5. Click the stop button or press Enter to send the message

## Technical Details

### Audio Format
- Sample Rate: 16kHz
- Channels: Mono (1)
- Bit Depth: 16-bit PCM
- Encoding: Base64 for transport

### Transcription Features
- Real-time streaming transcription
- Voice Activity Detection (VAD)
- Language: English (configurable)
- Automatic speech end detection

### WebSocket Events

#### Client → Server
- `audio:stream_start` - Begin recording session
- `audio:stream_data` - Send audio chunk
- `audio:stream_stop` - End recording session

#### Server → Client
- `audio:stream_started` - Confirm session started
- `audio:transcription_start` - Transcription began
- `audio:transcription_turn_delta` - Partial transcription update
- `audio:transcription_complete` - Final transcription result
- `audio:speech_start` - VAD detected speech
- `audio:speech_end` - VAD detected silence
- `audio:error` - Error occurred

## Error Handling

The system handles:
- Microphone permission denial
- Network disconnections
- Audio processing errors
- Transcription API failures

All errors are logged and displayed to the user appropriately.

## Future Enhancements

- Multi-language support
- Speaker diarization
- Custom vocabulary support
- Audio file upload support
- Voice commands for system control