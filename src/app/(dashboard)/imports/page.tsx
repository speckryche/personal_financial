'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/imports/file-upload'
import { ImportPreview } from '@/components/imports/import-preview'
import { ImportHistory } from '@/components/imports/import-history'
import { useToast } from '@/components/ui/use-toast'
import { parseRaymondJamesCSV } from '@/lib/parsers/quickbooks/investment-parser'
import {
  parseGeneralLedgerCSV,
  parseGeneralLedgerExcel,
  type ParsedGLTransaction,
  type DiscoveredAccount,
} from '@/lib/parsers/quickbooks/general-ledger-parser'
import { createClient } from '@/lib/supabase/client'
import type { ParsedInvestment } from '@/lib/parsers/quickbooks/investment-parser'
import type { Account, AccountType } from '@/types/database'
import { Check, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  PotentialDuplicatesModal,
  type PotentialDuplicate,
} from '@/components/imports/potential-duplicates-modal'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getAllQBMappings,
  classifyDiscoveredAccounts,
  type MappingType,
  type ClassifiedAccount,
  type AllMappingsResult,
} from '@/lib/qb-account-mapping'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ImportType = 'general-ledger' | 'investments'

interface CategoryInfo {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
}

export default function ImportsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<ImportType>('general-ledger')

  // Category mapping state
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [categoryMappings, setCategoryMappings] = useState<Map<string, string>>(new Map())
  const [pendingCategoryMappings, setPendingCategoryMappings] = useState<Record<string, string | null>>({})

  // Filter out MetaMask/wallet extension errors globally
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const msg = event.message?.toLowerCase() || ''
      if (msg.includes('metamask') || msg.includes('ethereum') || msg.includes('wallet')) {
        event.preventDefault()
        event.stopPropagation()
        console.warn('Suppressed wallet extension error:', event.message)
        return false
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason || '').toLowerCase()
      if (reason.includes('metamask') || reason.includes('ethereum') || reason.includes('wallet')) {
        event.preventDefault()
        console.warn('Suppressed wallet extension rejection:', event.reason)
        return false
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    loadCategories()
  }, [])

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
  const [parsedInvestments, setParsedInvestments] = useState<ParsedInvestment[]>([])
  const [parsedGLTransactions, setParsedGLTransactions] = useState<ParsedGLTransaction[]>([])
  const [discoveredAccounts, setDiscoveredAccounts] = useState<DiscoveredAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [existingAccounts, setExistingAccounts] = useState<Account[]>([])

  // Enhanced GL mapping state
  const [classifiedAccounts, setClassifiedAccounts] = useState<{ unmapped: ClassifiedAccount[], mapped: ClassifiedAccount[] }>({ unmapped: [], mapped: [] })
  const [qbMappings, setQbMappings] = useState<AllMappingsResult | null>(null)
  const [showMappedAccounts, setShowMappedAccounts] = useState(false)
  const [pendingGLMappings, setPendingGLMappings] = useState<Record<string, {
    mappingType: MappingType
    targetId?: string  // account_id or category_id
    newAccountType?: AccountType
    newAccountName?: string
    newCategoryName?: string
    newCategoryType?: 'income' | 'expense'
  }>>({})
  const [isSavingMappings, setIsSavingMappings] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isCreatingAccounts, setIsCreatingAccounts] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    imported: number
    duplicatesSkipped: number
    ignoredFromSkippedAccounts?: number
    errors: string[]
    newUnmappedAccounts?: string[]
    uncategorizedCount?: number
  } | null>(null)
  const [importHistoryKey, setImportHistoryKey] = useState(0)
  const [potentialDuplicates, setPotentialDuplicates] = useState<PotentialDuplicate[]>([])
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const { toast } = useToast()

  // Load existing accounts for GL import
  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('*')
    setExistingAccounts(data || [])
  }

  // Load QB mappings (ignored accounts, account mappings, category mappings)
  const loadQBMappings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const mappings = await getAllQBMappings(supabase, user.id)
    console.log('Loaded QB mappings:', {
      ignored: mappings.ignoredAccounts.size,
      accounts: mappings.accountMappings.size,
      categories: mappings.categoryMappings.size,
      accountNames: Array.from(mappings.accountMappings.keys()).slice(0, 5),
    })
    setQbMappings(mappings)
    return mappings
  }, [supabase])

  // Classify discovered accounts against existing mappings
  const classifyAccounts = useCallback(async (accounts: DiscoveredAccount[]) => {
    // Always fetch fresh mappings to ensure we have the latest data
    const mappings = await loadQBMappings()
    if (!mappings) return

    const classified = classifyDiscoveredAccounts(accounts, mappings)
    setClassifiedAccounts(classified)
    console.log('Classified accounts:', { unmapped: classified.unmapped.length, mapped: classified.mapped.length })
  }, [loadQBMappings])

  useEffect(() => {
    loadAccounts()
    loadQBMappings()
  }, [])

  const refreshImportHistory = () => {
    setImportHistoryKey((prev) => prev + 1)
  }

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)
    setUploadResult(null)
    setParseErrors([])

    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')

    if (activeTab === 'general-ledger') {
      let result

      if (isExcel) {
        const buffer = await file.arrayBuffer()
        result = parseGeneralLedgerExcel(buffer)
      } else {
        const content = await file.text()
        result = await parseGeneralLedgerCSV(content)
      }

      setParsedGLTransactions(result.transactions)
      setDiscoveredAccounts(result.discoveredAccounts)
      setParsedInvestments([])
      setParseErrors(result.errors)
      setPendingGLMappings({})

      // Classify discovered accounts against existing mappings
      await classifyAccounts(result.discoveredAccounts)

      // Pre-select suggested (balance sheet) accounts that don't already exist
      const existingNames = new Set(existingAccounts.map(a => a.name.toLowerCase()))
      const suggestedAccountNames = result.discoveredAccounts
        .filter(a => !a.isIncomeExpenseCategory && !existingNames.has(a.name.toLowerCase()))
        .map(a => a.name)
      setSelectedAccounts(new Set(suggestedAccountNames))

      if (result.transactions.length === 0) {
        toast({
          title: 'No transactions found',
          description: 'The file does not contain any valid General Ledger data.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'File parsed',
          description: `Found ${result.transactions.length} transactions across ${result.discoveredAccounts.length} accounts.`,
        })
      }
    } else {
      const content = await file.text()
      const result = await parseRaymondJamesCSV(content)
      setParsedInvestments(result.investments)
      setParsedGLTransactions([])
      setDiscoveredAccounts([])
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

  const handleCreateSelectedAccounts = async () => {
    if (selectedAccounts.size === 0) return

    setIsCreatingAccounts(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsCreatingAccounts(false)
      return
    }

    let createdCount = 0
    for (const accountName of Array.from(selectedAccounts)) {
      const discovered = discoveredAccounts.find(a => a.name === accountName)
      if (!discovered) continue

      // Determine net_worth_bucket based on type
      const netWorthBucket = discovered.isLiability ? 'liabilities' : 'cash'

      const { error } = await supabase.from('accounts').insert({
        user_id: user.id,
        name: discovered.name,
        account_type: discovered.suggestedType,
        net_worth_bucket: netWorthBucket,
        is_active: true,
        qb_account_names: [discovered.name],
      })

      if (!error) {
        createdCount++
      }
    }

    toast({
      title: 'Accounts created',
      description: `Created ${createdCount} new account${createdCount !== 1 ? 's' : ''}.`,
    })

    setSelectedAccounts(new Set())
    await loadAccounts()
    setIsCreatingAccounts(false)
  }

  const toggleAccountSelection = (name: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  // Handle GL mapping type change for unmapped accounts
  const handleGLMappingChange = (qbAccountName: string, mappingType: MappingType, options?: {
    targetId?: string
    newAccountType?: AccountType
    newAccountName?: string
    newCategoryName?: string
    newCategoryType?: 'income' | 'expense'
  }) => {
    setPendingGLMappings(prev => ({
      ...prev,
      [qbAccountName]: {
        mappingType,
        targetId: options?.targetId,
        newAccountType: options?.newAccountType,
        newAccountName: options?.newAccountName,
        newCategoryName: options?.newCategoryName,
        newCategoryType: options?.newCategoryType,
      }
    }))
  }

  // Save all pending GL mappings before import
  const savePendingGLMappings = async (): Promise<boolean> => {
    if (Object.keys(pendingGLMappings).length === 0) return true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('savePendingGLMappings: No user found')
      return false
    }

    setIsSavingMappings(true)
    console.log('savePendingGLMappings: Starting with mappings:', pendingGLMappings)

    try {
      for (const [qbAccountName, mapping] of Object.entries(pendingGLMappings)) {
        console.log(`Processing mapping: ${qbAccountName} -> ${mapping.mappingType}`, mapping)

        if (mapping.mappingType === 'ignored') {
          // Add to qb_ignored_accounts table
          console.log(`Adding ignored account: ${qbAccountName}`)
          const { error } = await supabase
            .from('qb_ignored_accounts')
            .upsert(
              { user_id: user.id, qb_account_name: qbAccountName },
              { onConflict: 'user_id,qb_account_name' }
            )
          if (error) {
            console.error('Error adding ignored account:', error)
            return false
          }
        } else if (mapping.mappingType === 'asset' || mapping.mappingType === 'liability') {
          let accountId = mapping.targetId
          console.log(`Processing ${mapping.mappingType}: targetId=${accountId}, newAccountName=${mapping.newAccountName}`)

          // Create new account if needed
          if (!accountId && mapping.newAccountName && mapping.newAccountType) {
            // First check if an account with this name already exists
            const { data: existingAccounts } = await supabase
              .from('accounts')
              .select('id, qb_account_names')
              .eq('user_id', user.id)
              .eq('name', mapping.newAccountName)

            const existingAccount = existingAccounts?.[0]
            if (existingAccount) {
              // Account exists - just add the QB name to it
              console.log(`Account "${mapping.newAccountName}" already exists, adding QB name to it`)
              accountId = existingAccount.id
              const currentNames = (existingAccount.qb_account_names || []) as string[]
              if (!currentNames.some(n => n.toLowerCase() === qbAccountName.toLowerCase())) {
                const { error: updateError } = await supabase
                  .from('accounts')
                  .update({ qb_account_names: [...currentNames, qbAccountName] })
                  .eq('id', accountId)

                if (updateError) {
                  console.error('Error updating existing account with QB name:', updateError)
                  return false
                }
              }
            } else {
              // Create new account
              const netWorthBucket = mapping.mappingType === 'liability' ? 'liabilities' : 'cash'
              console.log(`Creating new account: ${mapping.newAccountName} (${mapping.newAccountType})`)

              const { data: newAccount, error: createError } = await supabase
                .from('accounts')
                .insert({
                  user_id: user.id,
                  name: mapping.newAccountName,
                  account_type: mapping.newAccountType,
                  net_worth_bucket: netWorthBucket,
                  is_active: true,
                  qb_account_names: [qbAccountName],
                })
                .select('id')
                .single()

              if (createError) {
                console.error('Error creating account:', createError)
                return false
              }
              accountId = newAccount?.id
              console.log(`Created account with id: ${accountId}`)
            }
          } else if (accountId) {
            // Add QB name to existing account's qb_account_names
            console.log(`Adding QB name to existing account: ${accountId}`)
            const { data: account, error: fetchError } = await supabase
              .from('accounts')
              .select('qb_account_names')
              .eq('id', accountId)
              .single()

            if (fetchError) {
              console.error('Error fetching account:', fetchError)
              return false
            }

            const currentNames = (account?.qb_account_names || []) as string[]
            if (!currentNames.some(n => n.toLowerCase() === qbAccountName.toLowerCase())) {
              const { error } = await supabase
                .from('accounts')
                .update({ qb_account_names: [...currentNames, qbAccountName] })
                .eq('id', accountId)

              if (error) {
                console.error('Error updating account mappings:', error)
                return false
              }
            }
          } else {
            console.log(`Skipping ${qbAccountName} - no targetId or newAccountName provided`)
          }
        } else if (mapping.mappingType === 'income' || mapping.mappingType === 'expense') {
          // Save the classification so it's remembered for future imports
          console.log(`Saving ${mapping.mappingType} classification for: ${qbAccountName}`)
          const { error } = await supabase
            .from('qb_account_classifications')
            .upsert(
              {
                user_id: user.id,
                qb_account_name: qbAccountName,
                classification: mapping.mappingType,
              },
              { onConflict: 'user_id,qb_account_name' }
            )
          if (error) {
            console.error('Error saving classification:', error)
            return false
          }
        }
      }

      // Reload accounts, categories, and mappings
      console.log('savePendingGLMappings: All mappings saved successfully, reloading data...')
      await Promise.all([loadAccounts(), loadCategories(), loadQBMappings()])
      console.log('savePendingGLMappings: Complete!')
      return true
    } catch (error) {
      console.error('savePendingGLMappings: Unexpected error:', error)
      return false
    } finally {
      setIsSavingMappings(false)
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    setIsUploading(true)

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

    // Save any pending GL account mappings (for general-ledger imports)
    if (activeTab === 'general-ledger') {
      const glMappingsSaved = await savePendingGLMappings()
      if (!glMappingsSaved) {
        toast({
          title: 'Error saving account mappings',
          description: 'Failed to save QB account mappings. Please try again.',
          variant: 'destructive',
        })
        setIsUploading(false)
        return
      }
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const endpoint = activeTab === 'general-ledger'
        ? '/api/imports/general-ledger'
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
        ignoredFromSkippedAccounts: result.ignoredFromSkippedAccounts || 0,
        errors: result.errors || [],
        newUnmappedAccounts: result.newUnmappedAccounts || [],
        uncategorizedCount: result.uncategorizedCount || 0,
      })

      // Clear pending mappings after successful import
      setPendingCategoryMappings({})
      // Refresh the import history
      refreshImportHistory()
      console.log('Import result:', result)

      // Check for potential duplicates and show modal if any
      if (result.potentialDuplicates && result.potentialDuplicates.length > 0) {
        setPotentialDuplicates(result.potentialDuplicates)
        setShowDuplicatesModal(true)
        toast({
          title: 'Import successful - Review needed',
          description: `Imported ${result.imported} transactions. ${result.potentialDuplicates.length} potential duplicate(s) found that need your review.`,
          duration: 10000,
        })
      } else {
        const duplicateMsg = result.duplicatesSkipped > 0
          ? ` (${result.duplicatesSkipped} duplicate${result.duplicatesSkipped === 1 ? '' : 's'} skipped)`
          : ''

        // Show toast with unmapped accounts info if any
        if (result.newUnmappedAccounts && result.newUnmappedAccounts.length > 0) {
          toast({
            title: 'Import successful - Unmapped accounts detected',
            description: `Imported ${result.imported} transactions${duplicateMsg}. ${result.newUnmappedAccounts.length} QB account(s) need category mappings. Go to Settings → QB Categories to configure.`,
            duration: 10000,
          })
        } else {
          toast({
            title: 'Import successful',
            description: `Imported ${result.imported} transactions${duplicateMsg}.`,
          })
        }
      }
    } catch (error) {
      // Ignore MetaMask and other wallet extension errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (
        errorMessage.toLowerCase().includes('metamask') ||
        errorMessage.toLowerCase().includes('ethereum') ||
        errorMessage.toLowerCase().includes('wallet')
      ) {
        console.warn('Ignoring wallet extension error:', errorMessage)
        // Don't show error UI for wallet extension conflicts
        return
      }

      setUploadResult({
        success: false,
        imported: 0,
        duplicatesSkipped: 0,
        errors: [errorMessage],
      })

      toast({
        title: 'Import failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const resetState = () => {
    setSelectedFile(null)
    setParsedInvestments([])
    setParsedGLTransactions([])
    setDiscoveredAccounts([])
    setSelectedAccounts(new Set())
    setClassifiedAccounts({ unmapped: [], mapped: [] })
    setPendingGLMappings({})
    setShowMappedAccounts(false)
    setParseErrors([])
    setUploadResult(null)
    setPendingCategoryMappings({})
    setPotentialDuplicates([])
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as ImportType)
    resetState()
  }

  // Handle resolving potential duplicates
  const handleResolveDuplicates = async (decisions: Map<string, 'keep_new' | 'keep_existing' | 'keep_both'>) => {
    const transactionsToDelete: string[] = []

    for (const dup of potentialDuplicates) {
      const decision = decisions.get(dup.newTransaction.id)
      if (!decision) continue

      if (decision === 'keep_new') {
        // Delete the existing transaction
        transactionsToDelete.push(dup.existingTransaction.id)
      } else if (decision === 'keep_existing') {
        // Delete the newly imported transaction
        transactionsToDelete.push(dup.newTransaction.id)
      }
      // 'keep_both' - don't delete anything
    }

    if (transactionsToDelete.length > 0) {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', transactionsToDelete)

      if (error) {
        toast({
          title: 'Error resolving duplicates',
          description: error.message,
          variant: 'destructive',
        })
        return
      }
    }

    const keptNew = Array.from(decisions.values()).filter(d => d === 'keep_new').length
    const keptExisting = Array.from(decisions.values()).filter(d => d === 'keep_existing').length
    const keptBoth = Array.from(decisions.values()).filter(d => d === 'keep_both').length

    toast({
      title: 'Duplicates resolved',
      description: `Kept ${keptNew} new, ${keptExisting} existing, ${keptBoth} both.`,
    })

    setPotentialDuplicates([])
    refreshImportHistory()
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
          <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
          <TabsTrigger value="investments">Raymond James Investments</TabsTrigger>
        </TabsList>

        {/* General Ledger Tab */}
        <TabsContent value="general-ledger" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import QuickBooks General Ledger</CardTitle>
              <CardDescription>
                Upload a General Ledger report from QuickBooks. This will discover all accounts
                and their transactions for comprehensive balance tracking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FileUpload
                onFileSelect={handleFileSelect}
                disabled={isUploading || isCreatingAccounts}
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

              {/* QB Account Mapping - Unified View */}
              {discoveredAccounts.length > 0 && (() => {
                // Show ALL unmapped accounts - user manually classifies each one
                const unmappedAccounts = classifiedAccounts.unmapped

                return (
                <div className="space-y-6">
                  {/* UNMAPPED ACCOUNTS - Action Required */}
                  {unmappedAccounts.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-medium flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            Unmapped Accounts ({unmappedAccounts.length}) - Action Required
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Classify each QB account. Income/Expense accounts are mapped to categories in Settings.
                          </p>
                        </div>
                      </div>

                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-amber-50 dark:bg-amber-950/20">
                              <TableHead>QB Account Name</TableHead>
                              <TableHead>Transactions</TableHead>
                              <TableHead>Mapping Type</TableHead>
                              <TableHead>Map To</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unmappedAccounts.map((account) => {
                              const pending = pendingGLMappings[account.name]
                              const currentMappingType = pending?.mappingType || 'unmapped'

                              const getSuggestionLabel = (s: MappingType) => {
                                switch (s) {
                                  case 'asset': return 'Asset'
                                  case 'liability': return 'Liability'
                                  case 'ignored': return 'Ignore'
                                  case 'income': return 'Income'
                                  case 'expense': return 'Expense'
                                  default: return 'Unknown'
                                }
                              }

                              return (
                                <TableRow key={account.name} className="bg-amber-50/50 dark:bg-amber-950/10">
                                  <TableCell className="font-medium">
                                    <div className="flex flex-col gap-1">
                                      <span>{account.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        Suggested: {getSuggestionLabel(account.suggestion)}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {account.transactionCount} txns
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={currentMappingType}
                                      onValueChange={(value: MappingType) => {
                                        // When selecting Asset/Liability, default to "Create New Account"
                                        if (value === 'asset') {
                                          handleGLMappingChange(account.name, value, {
                                            newAccountName: account.name,
                                            newAccountType: account.suggestedType || 'checking',
                                          })
                                        } else if (value === 'liability') {
                                          handleGLMappingChange(account.name, value, {
                                            newAccountName: account.name,
                                            newAccountType: account.isLiability ? (account.suggestedType || 'credit_card') : 'credit_card',
                                          })
                                        } else {
                                          handleGLMappingChange(account.name, value)
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Select type..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="unmapped">-- Select --</SelectItem>
                                        <SelectItem value="ignored">Ignore</SelectItem>
                                        <SelectItem value="asset">Asset</SelectItem>
                                        <SelectItem value="liability">Liability</SelectItem>
                                        <SelectItem value="income">Income</SelectItem>
                                        <SelectItem value="expense">Expense</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    {currentMappingType === 'ignored' && (
                                      <span className="text-sm text-muted-foreground">Transactions will be skipped</span>
                                    )}
                                    {currentMappingType === 'asset' && (
                                      <div className="flex items-center gap-2">
                                        <Select
                                          value={pending?.targetId || 'new'}
                                          onValueChange={(value) => {
                                            if (value === 'new') {
                                              handleGLMappingChange(account.name, 'asset', {
                                                newAccountName: account.name,
                                                newAccountType: account.suggestedType,
                                              })
                                            } else {
                                              handleGLMappingChange(account.name, 'asset', {
                                                targetId: value,
                                              })
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Select account..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="new">+ Create New Account</SelectItem>
                                            {existingAccounts
                                              .filter(acc => ['checking', 'savings', 'investment', 'retirement', 'other'].includes(acc.account_type))
                                              .map((acc) => (
                                                <SelectItem key={acc.id} value={acc.id}>
                                                  {acc.name}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                        {pending?.targetId === undefined && (
                                          <Select
                                            value={pending?.newAccountType || account.suggestedType}
                                            onValueChange={(value: AccountType) => {
                                              handleGLMappingChange(account.name, 'asset', {
                                                newAccountName: account.name,
                                                newAccountType: value,
                                              })
                                            }}
                                          >
                                            <SelectTrigger className="w-[140px]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="checking">Checking</SelectItem>
                                              <SelectItem value="savings">Savings</SelectItem>
                                              <SelectItem value="investment">Investment</SelectItem>
                                              <SelectItem value="retirement">Retirement</SelectItem>
                                              <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        )}
                                      </div>
                                    )}
                                    {currentMappingType === 'liability' && (
                                      <div className="flex items-center gap-2">
                                        <Select
                                          value={pending?.targetId || 'new'}
                                          onValueChange={(value) => {
                                            if (value === 'new') {
                                              handleGLMappingChange(account.name, 'liability', {
                                                newAccountName: account.name,
                                                newAccountType: account.isLiability ? account.suggestedType : 'credit_card',
                                              })
                                            } else {
                                              handleGLMappingChange(account.name, 'liability', {
                                                targetId: value,
                                              })
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="w-[200px]">
                                            <SelectValue placeholder="Select account..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="new">+ Create New Account</SelectItem>
                                            {existingAccounts
                                              .filter(acc => ['credit_card', 'loan', 'mortgage'].includes(acc.account_type))
                                              .map((acc) => (
                                                <SelectItem key={acc.id} value={acc.id}>
                                                  {acc.name}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                        {pending?.targetId === undefined && (
                                          <Select
                                            value={pending?.newAccountType || (account.isLiability ? account.suggestedType : 'credit_card')}
                                            onValueChange={(value: AccountType) => {
                                              handleGLMappingChange(account.name, 'liability', {
                                                newAccountName: account.name,
                                                newAccountType: value,
                                              })
                                            }}
                                          >
                                            <SelectTrigger className="w-[140px]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="credit_card">Credit Card</SelectItem>
                                              <SelectItem value="loan">Loan</SelectItem>
                                              <SelectItem value="mortgage">Mortgage</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        )}
                                      </div>
                                    )}
                                    {(currentMappingType === 'income' || currentMappingType === 'expense') && (
                                      <span className="text-sm text-muted-foreground">
                                        Map to category in Settings → QB Categories
                                      </span>
                                    )}
                                    {currentMappingType === 'unmapped' && (
                                      <span className="text-sm text-amber-600">Select a mapping type</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* ALREADY MAPPED ACCOUNTS - Collapsible */}
                  {classifiedAccounts.mapped.length > 0 && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowMappedAccounts(!showMappedAccounts)}
                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showMappedAccounts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        Already Mapped ({classifiedAccounts.mapped.length})
                      </button>

                      {showMappedAccounts && (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>QB Account Name</TableHead>
                                <TableHead>Mapping Type</TableHead>
                                <TableHead>Mapped To</TableHead>
                                <TableHead>Transactions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {classifiedAccounts.mapped.map((account) => (
                                <TableRow key={account.name}>
                                  <TableCell className="font-medium">{account.name}</TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      account.mappingType === 'ignored' ? 'secondary' :
                                      account.mappingType === 'asset' ? 'default' :
                                      account.mappingType === 'liability' ? 'destructive' :
                                      account.mappingType === 'income' ? 'outline' : 'outline'
                                    }>
                                      {account.mappingType === 'ignored' ? 'Ignored' :
                                       account.mappingType === 'asset' ? 'Asset' :
                                       account.mappingType === 'liability' ? 'Liability' :
                                       account.mappingType === 'income' ? 'Income' : 'Expense'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {account.mappedTo ? (
                                      <span className="text-sm">
                                        → {account.mappedTo.name}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {account.transactionCount} txns
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Import Summary */}
                  {parsedGLTransactions.length > 0 && (
                    <div className="rounded-lg border bg-muted/50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="font-medium">Import Summary</p>
                          <p className="text-sm text-muted-foreground">
                            {parsedGLTransactions.length} total transactions
                            {classifiedAccounts.mapped.filter(a => a.mappingType === 'ignored').length > 0 && (
                              <span className="ml-2">
                                • {classifiedAccounts.mapped.filter(a => a.mappingType === 'ignored').reduce((sum, a) => sum + a.transactionCount, 0)} will be skipped (ignored accounts)
                              </span>
                            )}
                            {Object.values(pendingGLMappings).filter(m => m.mappingType === 'ignored').length > 0 && (
                              <span className="ml-2">
                                • {unmappedAccounts
                                    .filter(a => pendingGLMappings[a.name]?.mappingType === 'ignored')
                                    .reduce((sum, a) => sum + a.transactionCount, 0)} will be skipped (newly ignored)
                              </span>
                            )}
                          </p>
                          {unmappedAccounts.some(a => !pendingGLMappings[a.name]) && (
                            <p className="text-sm text-amber-600">
                              {unmappedAccounts.filter(a => !pendingGLMappings[a.name]).length} unmapped account(s) need configuration
                            </p>
                          )}
                        </div>
                        <Button
                          onClick={handleImport}
                          disabled={isUploading || isSavingMappings || unmappedAccounts.some(a => !pendingGLMappings[a.name])}
                        >
                          {(isUploading || isSavingMappings) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save & Import
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )})()}

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
                        ? `Successfully imported ${uploadResult.imported} transactions`
                        : 'Import failed'}
                    </span>
                  </div>
                  {uploadResult.success && (uploadResult.duplicatesSkipped > 0 || (uploadResult.ignoredFromSkippedAccounts && uploadResult.ignoredFromSkippedAccounts > 0)) && (
                    <p className="text-sm mt-1 opacity-80">
                      {uploadResult.duplicatesSkipped > 0 && (
                        <span>{uploadResult.duplicatesSkipped} duplicate{uploadResult.duplicatesSkipped === 1 ? '' : 's'} skipped</span>
                      )}
                      {uploadResult.duplicatesSkipped > 0 && uploadResult.ignoredFromSkippedAccounts && uploadResult.ignoredFromSkippedAccounts > 0 && ' • '}
                      {uploadResult.ignoredFromSkippedAccounts && uploadResult.ignoredFromSkippedAccounts > 0 && (
                        <span>{uploadResult.ignoredFromSkippedAccounts} from ignored accounts</span>
                      )}
                    </p>
                  )}
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

              <ImportHistory
                key={`gl-${importHistoryKey}`}
                fileType="quickbooks_general_ledger"
                onImportDeleted={refreshImportHistory}
              />
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

      {/* Potential Duplicates Review Modal */}
      <PotentialDuplicatesModal
        open={showDuplicatesModal}
        onOpenChange={setShowDuplicatesModal}
        duplicates={potentialDuplicates}
        onResolve={handleResolveDuplicates}
      />
    </div>
  )
}
