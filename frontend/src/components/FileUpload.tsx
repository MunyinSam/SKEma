'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Upload, X, FileIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadFile, formatFileSize, UploadProgress } from '@/services/file.service';
import { isAllowedFileType, ALLOWED_EXTENSIONS } from '@/lib/allowedFileTypes';

interface FileUploadProps {
	onUploadComplete?: () => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
	useSession();
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const files = e.dataTransfer.files;
		if (files && files.length > 0) {
			handleFileSelect(files[0]);
		}
	};

	const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			handleFileSelect(files[0]);
		}
	};

	const handleFileSelect = (file: File) => {
		if (!isAllowedFileType(file)) {
			setError(`File type not allowed: ${file.name}`);
			return;
		}
		const maxSize = 50 * 1024 * 1024;
		if (file.size > maxSize) {
			setError('File size exceeds 50MB limit');
			return;
		}

		setSelectedFile(file);
		setError(null);
		setSuccess(false);
	};

	const handleUpload = async () => {
		if (!selectedFile) return;

		setUploading(true);
		setError(null);
		setSuccess(false);
		setProgress(null);

		try {
			await uploadFile(selectedFile, (prog) => {
				setProgress(prog);
			});

			setSuccess(true);
			setSelectedFile(null);
			setProgress(null);

			// Reset file input
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}

			// Call callback after successful upload
			if (onUploadComplete) {
				setTimeout(() => {
					onUploadComplete();
					setSuccess(false);
				}, 2000);
			}
		} catch (err: unknown) {
			console.error('Upload error:', err);
			setError(
				(err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
					'Failed to upload file'
			);
			setProgress(null);
		} finally {
			setUploading(false);
		}
	};

	const handleRemoveFile = () => {
		setSelectedFile(null);
		setError(null);
		setSuccess(false);
		setProgress(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleBrowseClick = () => {
		fileInputRef.current?.click();
	};

	return (
		<Card>
			<CardContent className="pt-6">
				{/* Drag and drop zone */}
				<div
					onDragEnter={handleDragEnter}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
						isDragging ? 'border-[#006837] bg-emerald-50' : 'border-gray-300 hover:border-[#006837]'
					}`}
				>
					<input
						ref={fileInputRef}
						type="file"
						onChange={handleFileInputChange}
						className="hidden"
						accept={ALLOWED_EXTENSIONS}
					/>

					{!selectedFile ? (
						<div className="space-y-4">
							<div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
								<Upload className="w-8 h-8 text-[#006837]" />
							</div>
							<div>
								<p className="text-lg font-medium mb-1">Drop your file here</p>
								<p className="text-sm text-muted-foreground mb-4">or click to browse (max 50MB)</p>
								<Button onClick={handleBrowseClick} variant="outline">
									Browse Files
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								Supported: PDF, Word, Excel, PowerPoint, ZIP, Images, Text, XML
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{/* File preview */}
							<div className="flex items-center justify-between p-4 bg-accent rounded-lg">
								<div className="flex items-center gap-3 flex-1">
									<FileIcon className="w-8 h-8 text-[#006837]" />
									<div className="text-left flex-1">
										<p className="font-medium truncate">{selectedFile.name}</p>
										<p className="text-sm text-muted-foreground">
											{formatFileSize(selectedFile.size)}
										</p>
									</div>
								</div>
								{!uploading && (
									<Button variant="ghost" size="sm" onClick={handleRemoveFile} className="ml-2">
										<X className="w-4 h-4" />
									</Button>
								)}
							</div>

							{/* Progress bar */}
							{uploading && progress && (
								<div className="space-y-2">
									<div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
										<div
											className="h-full bg-[#006837] transition-all duration-300"
											style={{ width: `${progress.percentage}%` }}
										/>
									</div>
									<p className="text-sm text-center text-muted-foreground">
										Uploading... {progress.percentage}%
									</p>
								</div>
							)}

							{/* Upload button */}
							{!uploading && !success && (
								<Button
									onClick={handleUpload}
									className="w-full bg-[#006837] hover:bg-[#005530]"
									disabled={uploading}
								>
									<Upload className="w-4 h-4 mr-2" />
									Upload File
								</Button>
							)}
						</div>
					)}

					{/* Success message */}
					{success && (
						<div className="flex items-center justify-center gap-2 text-green-600 mt-4">
							<CheckCircle className="w-5 h-5" />
							<span>File uploaded successfully!</span>
						</div>
					)}

					{/* Error message */}
					{error && (
						<div className="flex items-center justify-center gap-2 text-red-600 mt-4">
							<AlertCircle className="w-5 h-5" />
							<span>{error}</span>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
