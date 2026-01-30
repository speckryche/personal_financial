'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/imports/file-upload'
import { ImportPreview } from '@/components/imports/import-preview'
import { useToast } from '@/components/ui/use-toast'
import { parseQuickBooksTransactions, parseQuickBooksExcel } from '@/lib/parsers/quickbooks/transaction-parser'
import { parseRaymondJamesCSV } from '@/lib/parsers/quickbooks/investment-parser'
import { createClient } from '@/lib/supabase/client'
import type { ParsedTransaction } from '@/lib/parsers/quickbooks/transaction-parser'
import type { ParsedInvestment } from '@/lib/parsers/quickbooks/investment-parser'
import type { Category } from '@/types/database'
import { Check, AlertTriangle, Loader2 } from 'lucide-react'

type ImportType = 'quickbooks' | 'investments'

interface CategoryInfo {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
}

export default function ImportsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<ImportType>('quickbooks')
  const [typeMappings, setTypeMappings] = useState<Map<string, 'income' | 'expense'>>(new Map())
  const [pendingTypeMappings, setPendingTypeMappings] = useState<Record<string, 'income' | 'expense'>>({})

  // Category mapping state
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [categoryMappings, setCategoryMappings] = useState<Map<string, string>>(new Map())
  const [pendingCategoryMappings, setPendingCategoryMappings] = useState<Record<string, string | null>>({})

  useEffect(() => {
    loadTypeMappings()
    loadCategories()
  }, [])

  const loadTypeMappings = async () => {
    const { data } = await supabase
      .from('transaction_type_mappings')
      .select('qb_transaction_type, mapped_type')

    const mappings = new Map<string, 'income' | 'expense'>()
    for (const m of data || []) {
      mappings.set(m.qb_transaction_type.toLowerCase(), m.mapped_type as 'income' | 'expense')
    }
    setTypeMappings(mappings)
  }

  const loadCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('id, name, type, qb_category_names')
      .order('name')

    if (data) {
      // Build categories list
      setCategories(data.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type as 'income' | 'expense' | 'transfer'
      })))

      // Build mappings from qb_category_names
      const mappings = new Map<string, string>()
      for (const cat of data) {
        if (cat.qb_category_names && Array.isArray(cat.qb_category_names)) {
          for (const qbName of cat.qb_category_names) {
            mappings.set(qbName.toLowerCase(), cat.id)
          }
        }
      }
      setCategoryMappings(mappings)
    }
  }

  const handleTypeMappingChange = (qbType: string, mappedType: 'income' | 'expense') => {
    setPendingTypeMappings(prev => ({
      ...prev,
      [qbType.toLowerCase()]: mappedType
    }))
  }

  const handleCategoryMappingChange = (qbAccount: string, categoryId: string | null) => {
    setPendingCategoryMappings(prev => ({
      ...prev,
      [qbAccount.toLowerCase()]: categoryId
    }))
  }

  const handleCreateCategory = async (name: string, type: 'income' | 'expense'): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: user.id,
        name,
        type,
      })
      .select('id')
      .single()

    if (error) {
      toast({
        title: 'Error creating category',
        description: error.message,
        variant: 'destructive',
      })
      return null
    }

    // Reload categories to include the new one
    await loadCategories()

    toast({
      title: 'Category created',
      description: `"${name}" has been added.`,
    })

    return data?.id || null
  }

  const savePendingTypeMappings = async () => {
    if (Object.keys(pendingTypeMappings).length === 0) return true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    for (const [qbType, mappedType] of Object.entries(pendingTypeMappings)) {
      const { error } = await supabase
        .from('transaction_type_mappings')
        .upsert(
          {
            user_id: user.id,
            qb_transaction_type: qbType,
            mapped_type: mappedType,
          },
          { onConflict: 'user_id,qb_transaction_type' }
        )

      if (error) {
        console.error('Error saving type mapping:', error)
        return false
      }
    }

    // Reload mappings after saving
    await loadTypeMappings()
    return true
  }

  const savePendingCategoryMappings = async () => {
    if (Object.keys(pendingCategoryMappings).length === 0) return true

    // Group pending mappings by target category
    const categoryUpdates = new Map<string, { add: string[]; remove: string[] }>()

    for (const [qbAccount, newCategoryId] of Object.entries(pendingCategoryMappings)) {
      // Find current category (if any)
      const currentCategoryId = categoryMappings.get(qbAccount)

      // Remove from old category
      if (currentCategoryId && currentCategoryId !== newCategoryId) {
        const update = categoryUpdates.get(currentCategoryId) || { add: [], remove: [] }
        update.remove.push(qbAccount)
        categoryUpdates.set(currentCategoryId, update)
      }

      // Add to new category
      if (newCategoryId) {
        const update = categoryUpdates.get(newCategoryId) || { add: [], remove: [] }
        update.add.push(qbAccount)
        categoryUpdates.set(newCategoryId, update)
      }
    }

    // Apply updates to each category
    for (const [categoryId, updates] of Array.from(categoryUpdates.entries())) {
      // Get current qb_category_names for this category
      const { data: catData } = await supabase
        .from('categories')
        .select('qb_category_names')
        .eq('id', categoryId)
        .single()

      const currentNames = new Set<string>(catData?.qb_category_names || [])

      // Remove old mappings (case-insensitive)
      for (const name of updates.remove) {
        for (const existing of Array.from(currentNames)) {
          if (existing.toLowerCase() === name.toLowerCase()) {
            currentNames.delete(existing)
          }
        }
      }

      // Add new mappings
      for (const name of updates.add) {
        currentNames.add(name)
      }

      // Update the category
      const { error } = await supabase
        .from('categories')
        .update({ qb_category_names: Array.from(currentNames) })
        .eq('id', categoryId)

      if (error) {
        console.error('Error saving category mapping:', error)
        return false
      }
    }

    // Reload categories after saving
    await loadCategories()
    return true
  }
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([])
  const [parsedInvestments, setParsedInvestments] = useState<ParsedInvestment[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    imported: number
    duplicatesSkipped: number
    errors: string[]
  } | null>(null)
  const { toast } = useToast()

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)
    setUploadResult(null)
    setParseErrors([])

    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')

    if (activeTab === 'quickbooks') {
      let result

      if (isExcel) {
        // Parse Excel file
        const buffer = await file.arrayBuffer()
        result = parseQuickBooksExcel(buffer)
      } else {
        // Parse CSV file
        const content = await file.text()
        result = await parseQuickBooksTransactions(content)
      }

      setParsedTransactions(result.transactions)
      setParsedInvestments([])
      setParseErrors(result.errors)

      if (result.transactions.length === 0) {
        toast({
          title: 'No transactions found',
          description: 'The file does not contain any valid transactions. Check that your file has Date and Amount columns.',
          variant: 'destructive',
        })
      }
    } else {
      const content = await file.text()
      const result = await parseRaymondJamesCSV(content)
      setParsedInvestments(result.investments)
      setParsedTransactions([])
      setParseErrors(result.errors)

      if (result.investments.length === 0) {
        toast({
          title: 'No investments found',
          description: 'The file does not contain any valid investment data.',
          variant: 'destructive',
        })
      }
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    setIsUploading(true)

    // Save any pending type mappings first
    const typeMappingsSaved = await savePendingTypeMappings()
    if (!typeMappingsSaved) {
      toast({
        title: 'Error saving type mappings',
        description: 'Failed to save transaction type mappings. Please try again.',
        variant: 'destructive',
      })
      setIsUploading(false)
      return
    }

    // Save any pending category mappings
    const categoryMappingsSaved = await savePendingCategoryMappings()
    if (!categoryMappingsSaved) {
      toast({
        title: 'Error saving category mappings',
        description: 'Failed to save category mappings. Please try again.',
        variant: 'destructive',
      })
      setIsUploading(false)
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const endpoint =
        activeTab === 'quickbooks'
          ? '/api/imports/quickbooks'
          : '/api/imports/investments'

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Import failed')
      }

      setUploadResult({
        success: true,
        imported: result.imported,
        duplicatesSkipped: result.duplicatesSkipped || 0,
        errors: result.errors || [],
      })

      // Clear pending mappings after successful import
      setPendingTypeMappings({})
      setPendingCategoryMappings({})
      console.log('Import result:', result)
      const duplicateMsg = result.duplicatesSkipped > 0
        ? ` (${result.duplicatesSkipped} duplicate${result.duplicatesSkipped === 1 ? '' : 's'} skipped)`
        : ''
      toast({
        title: 'Import successful',
        description: `Imported ${result.imported} transactions${duplicateMsg}.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed'
      setUploadResult({
        success: false,
        imported: 0,
        duplicatesSkipped: 0,
        errors: [message],
      })

      toast({
        title: 'Import failed',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const resetState = () => {
    setSelectedFile(null)
    setParsedTransactions([])
    setParsedInvestments([])
    setParseErrors([])
    setUploadResult(null)
    setPendingTypeMappings({})
    setPendingCategoryMappings({})
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as ImportType)
    resetState()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground">
          Upload your financial data from QuickBooks or Raymond James
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="quickbooks">QuickBooks Transactions</TabsTrigger>
          <TabsTrigger value="investments">Raymond James Investments</TabsTrigger>
        </TabsList>

        <TabsContent value="quickbooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import QuickBooks Transactions</CardTitle>
              <CardDescription>
                Upload a Transaction Detail report exported from QuickBooks (CSV or Excel)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FileUpload
                onFileSelect={handleFileSelect}
                disabled={isUploading}
                isUploading={isUploading}
              />

              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Parse warnings</span>
                  </div>
                  <ul className="mt-2 list-disc list-inside text-sm text-amber-600 dark:text-amber-300">
                    {parseErrors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {parseErrors.length > 5 && (
                      <li>...and {parseErrors.length - 5} more warnings</li>
                    )}
                  </ul>
                </div>
              )}

              {parsedTransactions.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Preview of {parsedTransactions.length} transactions to import
                    </p>
                    <Button onClick={handleImport} disabled={isUploading}>
                      {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Import {parsedTransactions.length} Transactions
                    </Button>
                  </div>
                  <ImportPreview
                    type="transactions"
                    data={parsedTransactions}
                    typeMappings={typeMappings}
                    pendingTypeMappings={pendingTypeMappings}
                    onTypeMappingChange={handleTypeMappingChange}
                    categories={categories}
                    categoryMappings={categoryMappings}
                    pendingCategoryMappings={pendingCategoryMappings}
                    onCategoryMappingChange={handleCategoryMappingChange}
                    onCreateCategory={handleCreateCategory}
                  />
                </>
              )}

              {uploadResult && (
                <div
                  className={`rounded-lg border p-4 ${
                    uploadResult.success
                      ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
                      : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {uploadResult.success ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {uploadResult.success
                        ? `Successfully imported ${uploadResult.imported} transactions${
                            uploadResult.duplicatesSkipped > 0
                              ? ` (${uploadResult.duplicatesSkipped} duplicate${uploadResult.duplicatesSkipped === 1 ? '' : 's'} skipped)`
                              : ''
                          }`
                        : 'Import failed'}
                    </span>
                  </div>
                  {uploadResult.errors.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-sm opacity-80">
                      {uploadResult.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  )}
                  {uploadResult.success && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={resetState}
                    >
                      Import Another File
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import Raymond James Holdings</CardTitle>
              <CardDescription>
                Upload your portfolio holdings export from Raymond James as CSV
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FileUpload
                onFileSelect={handleFileSelect}
                disabled={isUploading}
                isUploading={isUploading}
              />

              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Parse warnings</span>
                  </div>
                  <ul className="mt-2 list-disc list-inside text-sm text-amber-600 dark:text-amber-300">
                    {parseErrors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedInvestments.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Preview of {parsedInvestments.length} holdings to import
                    </p>
                    <Button onClick={handleImport} disabled={isUploading}>
                      {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Import {parsedInvestments.length} Holdings
                    </Button>
                  </div>
                  <ImportPreview type="investments" data={parsedInvestments} />
                </>
              )}

              {uploadResult && (
                <div
                  className={`rounded-lg border p-4 ${
                    uploadResult.success
                      ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
                      : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {uploadResult.success ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {uploadResult.success
                        ? `Successfully imported ${uploadResult.imported} holdings`
                        : 'Import failed'}
                    </span>
                  </div>
                  {uploadResult.success && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={resetState}
                    >
                      Import Another File
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
