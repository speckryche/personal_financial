import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Save to tmp-uploads directory in project root
    const uploadDir = path.join(process.cwd(), 'tmp-uploads')
    const filePath = path.join(uploadDir, file.name)

    await writeFile(filePath, buffer)

    return NextResponse.json({
      success: true,
      filename: file.name,
      path: filePath,
      size: buffer.length,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to save file' },
      { status: 500 }
    )
  }
}
