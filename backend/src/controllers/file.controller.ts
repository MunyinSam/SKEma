import { Request, Response } from 'express';
import {
	createFile,
	getAllFiles,
	getFileById,
	incrementDownloadCount,
	deleteFile as deleteFileModel,
	getFilesByUser,
	getPublicFilesByFolder,
} from '../models/file.model';
import fs from 'fs';

// Allowed MIME types mapped from magic byte detection
const ALLOWED_MIME_TYPES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/zip',
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'application/xml'
]);

// MIME types that file-type cannot detect (text-based) — trust multer's filter
const TEXT_BASED_MIME_TYPES = new Set([
	'text/plain',
	'text/csv',
	'text/x-python',
	'text/x-python-script',
	'application/x-python-code',
	'text/x-c',
	'text/x-csrc',
	'text/x-chdr',
	'text/x-c++src',
	'text/x-c++hdr',
	'text/x-asm',
	'text/x-assembler',
	'text/xml'
]);

// Upload file controller
export const uploadFileController = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		if (!req.file) {
			res.status(400).json({ error: 'No file uploaded' });
			return;
		}

		// Get user ID from auth middleware
		const userId = req.user?.id;
		if (!userId) {
			// Delete uploaded file if user not authenticated
			fs.unlinkSync(req.file.path);
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}

		// Validate actual file content via magic bytes (ESM dynamic import)
		if (!TEXT_BASED_MIME_TYPES.has(req.file.mimetype)) {
			const { fileTypeFromStream } = await import('file-type');
			const stream = fs.createReadStream(req.file.path);
			const detected = await fileTypeFromStream(stream);

			if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
				fs.unlinkSync(req.file.path);
				res.status(400).json({
					error: 'File content does not match its declared type. Upload rejected.',
				});
				return;
			}
		}

		// Get optional folderId and privacy from request body
		const { folderId, privacy } = req.body;

		// Save file metadata to database
		const fileMetadata = await createFile(
			req.file.filename,
			req.file.originalname,
			req.file.mimetype,
			req.file.size,
			req.file.path,
			userId,
			folderId,
			privacy
		);

		res.status(201).json({
			message: 'File uploaded successfully',
			file: fileMetadata,
		});
	} catch (error) {
		console.error('Error uploading file:', error);
		// Delete uploaded file if database save fails
		if (req.file) {
			fs.unlinkSync(req.file.path);
		}
		res.status(500).json({ error: 'Failed to upload file' });
	}
};

// Get all files controller
export const getAllFilesController = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const page = Math.max(1, parseInt(req.query.page as string) || 1);
		const limit = Math.min(
			100,
			Math.max(1, parseInt(req.query.limit as string) || 20)
		);
		const search = (req.query.search as string) ?? '';
		const result = await getAllFiles(page, limit, search);
		res.status(200).json(result);
	} catch (error) {
		console.error('Error fetching files:', error);
		res.status(500).json({ error: 'Failed to fetch files' });
	}
};

// Get file by ID controller
export const getFileByIdController = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const id = req.params.id as string;
		const file = await getFileById(id);

		if (!file) {
			res.status(404).json({ error: 'File not found' });
			return;
		}

		res.status(200).json(file);
	} catch (error) {
		console.error('Error fetching file:', error);
		res.status(500).json({ error: 'Failed to fetch file' });
	}
};

// Download file controller
export const downloadFileController = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		console.log('Download request received for ID:', req.params.id);

		const id = req.params.id as string;
		const file = await getFileById(id);

		if (!file) {
			console.error('File not found in database:', id);
			res.status(404).json({ error: 'File not found' });
			return;
		}

		console.log('File found:', {
			id: file.id,
			path: file.path,
			originalName: file.originalName,
		});

		// Check if file exists on disk
		if (!fs.existsSync(file.path)) {
			console.error(`File not found on disk: ${file.path}`);
			res.status(404).json({ error: 'File not found on server' });
			return;
		}

		// Increment download count
		await incrementDownloadCount(id);

		// Set headers for file download
		res.setHeader('Content-Type', file.mimetype);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${encodeURIComponent(file.originalName)}"`
		);
		res.setHeader('Content-Length', file.size.toString());

		// Stream file to client with error handling
		const fileStream = fs.createReadStream(file.path);

		fileStream.on('error', (streamError) => {
			console.error('File stream error:', streamError);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Failed to read file' });
			}
		});

		fileStream.pipe(res);
	} catch (error) {
		console.error('Error downloading file:', error);
		if (!res.headersSent) {
			res.status(500).json({ error: 'Failed to download file' });
		}
	}
};

// Delete file controller
export const deleteFileController = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const id = req.params.id as string;
		const userId = req.user?.id;

		if (!userId) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}

		// Get file to check ownership
		const file = await getFileById(id);

		if (!file) {
			res.status(404).json({ error: 'File not found' });
			return;
		}

		// Check if user owns the file
		if (file.uploadedBy !== userId) {
			res.status(403).json({
				error: 'You do not have permission to delete this file',
			});
			return;
		}

		// Delete file from database
		const deletedFile = await deleteFileModel(id);

		// Delete file from disk
		if (fs.existsSync(file.path)) {
			fs.unlinkSync(file.path);
		}

		res.status(200).json({
			message: 'File deleted successfully',
			file: deletedFile,
		});
	} catch (error) {
		console.error('Error deleting file:', error);
		res.status(500).json({ error: 'Failed to delete file' });
	}
};

// Get files by user controller
export const getFilesByUserController = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const userId = req.params.userId as string;
		const files = await getFilesByUser(userId);
		res.status(200).json(files);
	} catch (error) {
		console.error('Error fetching user files:', error);
		res.status(500).json({ error: 'Failed to fetch user files' });
	}
};

export const getFilesByFolder = async (
	req: Request,
	res: Response
): Promise<void> => {
	try {
		const userId = req.user?.id as string;
		const folderId = req.params.id as string;
		const search = (req.query.search as string) || '';
		const files = await getPublicFilesByFolder(userId, folderId, search);
		res.status(200).json(files);
	} catch (error) {
		console.error('Error fetching folder files:', error);
		res.status(500).json({ error: 'Failed to fetch folder files' });
	}
};
