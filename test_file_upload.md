# File Upload Test Plan

## Test Cases

### 1. Image Upload Test
- Create a test image file
- Drag and drop the image into the chat input
- Verify the image appears as an attachment badge
- Send the message with the image
- Verify the image is uploaded to `/magi_output/shared/input/`
- Verify the message is sent with structured content

### 2. File Upload Test  
- Create a test text file
- Click the paperclip button and select the file
- Verify the file appears as an attachment badge
- Send the message with the file
- Verify the file is uploaded to `/magi_output/shared/input/`
- Verify the message is sent with structured content

### 3. Multiple Files Test
- Attach multiple files (mix of images and documents)
- Verify all files appear as attachment badges
- Remove one file using the X button
- Send the message
- Verify only the remaining files are uploaded

### 4. Drag and Drop Test
- Drag files over the input area
- Verify the border changes to indicate drag state
- Drop the files
- Verify files are attached

## Expected Behavior

1. **UI Updates**:
   - Paperclip button in input field
   - File badges show with file icon and name
   - Drag area highlights when dragging files
   - Upload progress indicators during upload

2. **Server Processing**:
   - Files uploaded to `/api/upload` endpoint
   - Files saved to Docker volume via helper container
   - Unique file IDs generated for each file

3. **Message Format**:
   - Commands with files sent as JSON with `contentArray`
   - Images have `type: 'input_image'` with URL
   - Files have `type: 'input_file'` with filename and ID

4. **Engine Processing**:
   - Engine receives structured content via CommandMessage
   - Content parsed and added to history as user message
   - Agents can access file content through URLs

## Implementation Summary

The file upload feature has been fully implemented with:

1. **Frontend (React)**:
   - File input and drag-drop support in ChatColumn component
   - File attachment UI with badges and removal
   - Upload progress tracking
   - Structured message format for file content

2. **Backend (Express)**:
   - `/api/upload` endpoint using multer
   - File storage to Docker volume via helper container
   - Unique file ID generation

3. **Communication Layer**:
   - Updated CommandMessage interface with content field
   - Server parses structured content from JSON commands
   - Content passed through WebSocket to engine

4. **Engine**:
   - Updated spawnThought to accept structured content
   - Modified addHumanMessage to handle content arrays
   - Messages with files stored as user role with content array

The implementation supports both images and generic files, with proper type detection and structured message formatting compatible with the ResponseInputMessage types.