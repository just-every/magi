/**
 * File Upload Routes
 *
 * Handles file uploads from the chat interface
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max file size
    },
});

/**
 * Generate a unique file ID
 */
function generateFileId(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Upload file to Docker volume
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const fileId = generateFileId();
        const originalName = req.file.originalname;
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileExtension = path.extname(safeFileName);
        const fileName = `${fileId}${fileExtension}`;

        // Create the input directory in the shared volume via helper container
        const helperContainer = 'task-file-server';

        // First ensure the input directory exists
        try {
            await execAsync(
                `docker exec ${helperContainer} mkdir -p /magi_output/shared/input`
            );
        } catch (error) {
            // Directory might already exist, continue
            console.log('Directory creation:', error);
        }

        // Write the file to a temporary location first
        const tempPath = path.join('/tmp', fileName);
        await fs.writeFile(tempPath, req.file.buffer);

        // Copy the file to the Docker volume
        const targetPath = `/magi_output/shared/input/${fileName}`;
        try {
            await execAsync(
                `docker cp ${tempPath} ${helperContainer}:${targetPath}`
            );
        } catch (error) {
            console.error('Error copying file to Docker:', error);
            await fs.unlink(tempPath); // Clean up temp file
            throw error;
        }

        // Clean up temp file
        await fs.unlink(tempPath);

        // Return the file information
        res.json({
            success: true,
            fileId: fileName,
            filename: originalName,
            url: `/magi_output/shared/input/${fileName}`,
            size: req.file.size,
            type: req.file.mimetype,
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            error: 'Failed to upload file',
            details: String(error),
        });
    }
});

export default router;
