'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GradientProgress } from '@/components/ui/progress'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: Record<string, string[]>
  maxSize?: number
  disabled?: boolean
  isUploading?: boolean
  uploadProgress?: number
}

export function FileUpload({
  onFileSelect,
  accept = {
    'text/csv': ['.csv'],
    'text/plain': ['.csv'],
    'application/csv': ['.csv'],
    'application/vnd.ms-excel': ['.xls', '.csv'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  disabled = false,
  isUploading = false,
  uploadProgress = 0,
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: readonly { file: File; errors: readonly { message: string }[] }[]) => {
      setError(null)

      if (fileRejections.length > 0) {
        const rejection = fileRejections[0]
        const errorMessages = rejection.errors.map((e) => e.message).join(', ')
        setError(errorMessages)
        return
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]
        setSelectedFile(file)
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    disabled: disabled || isUploading,
    multiple: false,
  })

  const clearFile = () => {
    setSelectedFile(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all duration-200',
          isDragActive
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
          (disabled || isUploading) && 'cursor-not-allowed opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <div className={cn(
          'flex h-14 w-14 items-center justify-center rounded-xl mb-4 transition-colors',
          isDragActive ? 'bg-primary/10' : 'bg-muted'
        )}>
          <Upload className={cn(
            'h-6 w-6 transition-colors',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )} />
        </div>
        {isDragActive ? (
          <p className="text-sm font-medium text-primary">Drop the file here...</p>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-primary">Click to upload</span> or drag
              and drop
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              CSV or Excel files (max 10MB)
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {selectedFile && !error && (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-all duration-200 hover:border-primary/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          {!isUploading && (
            <Button variant="ghost" size="icon" onClick={clearFile} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {isUploading && (
        <div className="space-y-2">
          <GradientProgress value={uploadProgress} className="h-2" />
          <p className="text-center text-sm text-muted-foreground">
            Uploading... {uploadProgress}%
          </p>
        </div>
      )}
    </div>
  )
}
