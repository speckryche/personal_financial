'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Upload, Check } from 'lucide-react'

export default function UploadReviewPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; path?: string; error?: string } | null>(null)

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload-for-review', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        setResult({ success: true, path: data.path })
      } else {
        setResult({ success: false, error: data.error })
      }
    } catch (error) {
      setResult({ success: false, error: 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload File for Review</h1>
        <p className="text-muted-foreground">
          Upload a file so Claude can analyze its format
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV/Excel File</CardTitle>
          <CardDescription>
            This will save the file to the project's tmp-uploads folder where Claude can read it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload File
          </Button>

          {result && (
            <div
              className={`rounded-lg border p-4 ${
                result.success
                  ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
                  : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
              }`}
            >
              {result.success ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">File uploaded successfully!</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Saved to: <code className="bg-muted px-1 rounded">{result.path}</code>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tell Claude the file is ready and provide this path.
                  </p>
                </div>
              ) : (
                <div className="text-red-600">
                  Error: {result.error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
