'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Loader2, ChevronRight, AlertTriangle, Pencil, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { CategoryMapping } from '@/components/settings/category-mapping'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  getAccountsWithBalances,
  setStartingBalance,
  isLiabilityAccount,
  type AccountWithBalance,
} from '@/lib/account-balance'
import {
  buildCategoryTree,
  getParentCategories,
  getChildrenCount,
  type CategoryWithChildren,
} from '@/lib/category-utils'
import type { Account, AccountType, NetWorthBucket, Category } from '@/types/database'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function SettingsPage() {
  const supabase = createClient()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsWithBalances, setAccountsWithBalances] = useState<AccountWithBalance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  // Form states
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'checking' as AccountType,
    net_worth_bucket: 'cash' as NetWorthBucket,
    institution: '',
    starting_balance: '',
    starting_balance_date: new Date().toISOString().split('T')[0],
  })

  // Edit account state
  const [editAccount, setEditAccount] = useState<{
    id: string
    name: string
    account_type: AccountType
    net_worth_bucket: NetWorthBucket
    institution: string
    is_active: boolean
    starting_balance: string
    starting_balance_date: string
  } | null>(null)
  const [isEditingAccount, setIsEditingAccount] = useState(false)

  const [newCategory, setNewCategory] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    isSubcategory: false,
    parent_id: null as string | null,
  })

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
    childrenCount: number
  } | null>(null)

  // Edit category state
  const [editCategory, setEditCategory] = useState<{
    id: string
    name: string
    type: 'income' | 'expense' | 'transfer'
    parent_id: string | null
    hasChildren: boolean
  } | null>(null)
  const [isEditingCategory, setIsEditingCategory] = useState(false)

  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [dialogOpen, setDialogOpen] = useState<'account' | 'category' | 'home' | null>(null)
  const [activeTab, setActiveTab] = useState('accounts')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [accountsRes, categoriesRes] = await Promise.all([
      supabase.from('accounts').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])

    if (accountsRes.data) {
      setAccounts(accountsRes.data)
      // Also load accounts with balances
      if (user) {
        const withBalances = await getAccountsWithBalances(supabase, user.id)
        setAccountsWithBalances(withBalances)
      }
    }
    if (categoriesRes.data) setCategories(categoriesRes.data)
    setLoading(false)
  }

  const handleAddAccount = async () => {
    if (!newAccount.name) return
    setIsAddingAccount(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: accountData, error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: newAccount.name,
      account_type: newAccount.account_type,
      net_worth_bucket: newAccount.net_worth_bucket,
      institution: newAccount.institution || null,
    }).select().single()

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      // If starting balance was provided, save it
      if (newAccount.starting_balance && accountData) {
        const balance = parseFloat(newAccount.starting_balance)
        if (!isNaN(balance)) {
          await setStartingBalance(
            supabase,
            accountData.id,
            balance,
            newAccount.starting_balance_date
          )
        }
      }

      toast({ title: 'Account added successfully' })
      setNewAccount({
        name: '',
        account_type: 'checking',
        net_worth_bucket: 'cash',
        institution: '',
        starting_balance: '',
        starting_balance_date: new Date().toISOString().split('T')[0],
      })
      setDialogOpen(null)
      loadData()
    }
    setIsAddingAccount(false)
  }

  const handleEditAccountClick = (account: AccountWithBalance) => {
    setEditAccount({
      id: account.id,
      name: account.name,
      account_type: account.account_type,
      net_worth_bucket: account.net_worth_bucket,
      institution: account.institution || '',
      is_active: account.is_active,
      starting_balance: account.starting_balance?.toString() || '',
      starting_balance_date: account.starting_balance_date || new Date().toISOString().split('T')[0],
    })
  }

  const handleUpdateAccount = async () => {
    if (!editAccount || !editAccount.name) return
    setIsEditingAccount(true)

    const { error } = await supabase
      .from('accounts')
      .update({
        name: editAccount.name,
        account_type: editAccount.account_type,
        net_worth_bucket: editAccount.net_worth_bucket,
        institution: editAccount.institution || null,
        is_active: editAccount.is_active,
      })
      .eq('id', editAccount.id)

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      // Update starting balance if changed
      if (editAccount.starting_balance) {
        const balance = parseFloat(editAccount.starting_balance)
        if (!isNaN(balance)) {
          await setStartingBalance(
            supabase,
            editAccount.id,
            balance,
            editAccount.starting_balance_date
          )
        }
      }

      toast({ title: 'Account updated successfully' })
      setEditAccount(null)
      loadData()
    }
    setIsEditingAccount(false)
  }

  const handleToggleAccountActive = async (account: Account) => {
    const { error } = await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: account.is_active ? 'Account deactivated' : 'Account activated' })
      loadData()
    }
  }

  const handleDeleteAccount = async (id: string) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Account deleted' })
      loadData()
    }
  }

  const handleAddCategory = async () => {
    if (!newCategory.name) return

    // Validation: subcategory must have a parent
    if (newCategory.isSubcategory && !newCategory.parent_id) {
      toast({
        title: 'Error',
        description: 'Please select a parent category for the subcategory',
        variant: 'destructive',
      })
      return
    }

    // Validation: subcategory type must match parent type
    if (newCategory.isSubcategory && newCategory.parent_id) {
      const parent = categories.find((c) => c.id === newCategory.parent_id)
      if (parent && parent.type !== newCategory.type) {
        toast({
          title: 'Error',
          description: `Subcategory type must match parent type (${parent.type})`,
          variant: 'destructive',
        })
        return
      }
    }

    // Validation: cannot create sub-subcategory (parent must have parent_id === null)
    if (newCategory.isSubcategory && newCategory.parent_id) {
      const parent = categories.find((c) => c.id === newCategory.parent_id)
      if (parent && parent.parent_id !== null) {
        toast({
          title: 'Error',
          description: 'Cannot create a subcategory of a subcategory (2 tiers maximum)',
          variant: 'destructive',
        })
        return
      }
    }

    setIsAddingCategory(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      name: newCategory.name,
      type: newCategory.type,
      parent_id: newCategory.isSubcategory ? newCategory.parent_id : null,
    })

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Category added successfully' })
      setNewCategory({ name: '', type: 'expense', isSubcategory: false, parent_id: null })
      setDialogOpen(null)
      loadData()
    }
    setIsAddingCategory(false)
  }

  const handleDeleteCategoryClick = (category: Category) => {
    const childrenCount = getChildrenCount(category.id, categories)
    if (childrenCount > 0) {
      setDeleteConfirm({
        id: category.id,
        name: category.name,
        childrenCount,
      })
    } else {
      handleDeleteCategory(category.id)
    }
  }

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Category deleted' })
      loadData()
    }
    setDeleteConfirm(null)
  }

  const handleEditCategoryClick = (category: Category) => {
    const hasChildren = categories.some((c) => c.parent_id === category.id)
    setEditCategory({
      id: category.id,
      name: category.name,
      type: category.type,
      parent_id: category.parent_id,
      hasChildren,
    })
  }

  const handleUpdateCategory = async () => {
    if (!editCategory || !editCategory.name) return

    // Validation: if assigning a parent, type must match
    if (editCategory.parent_id) {
      const parent = categories.find((c) => c.id === editCategory.parent_id)
      if (parent && parent.type !== editCategory.type) {
        toast({
          title: 'Error',
          description: `Type must match parent type (${parent.type})`,
          variant: 'destructive',
        })
        return
      }
      // Cannot assign to a subcategory (only 2 tiers)
      if (parent && parent.parent_id !== null) {
        toast({
          title: 'Error',
          description: 'Cannot assign to a subcategory (2 tiers maximum)',
          variant: 'destructive',
        })
        return
      }
    }

    setIsEditingCategory(true)

    const { error } = await supabase
      .from('categories')
      .update({
        name: editCategory.name,
        parent_id: editCategory.parent_id,
      })
      .eq('id', editCategory.id)

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Category updated successfully' })
      setEditCategory(null)
      loadData()
    }
    setIsEditingCategory(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your accounts, categories, and property values
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="qb-mappings">QB Categories</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>
                  Manage your bank accounts, credit cards, and investment accounts with balance tracking
                </CardDescription>
              </div>
              <Dialog open={dialogOpen === 'account'} onOpenChange={(o) => setDialogOpen(o ? 'account' : null)}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Account</DialogTitle>
                    <DialogDescription>
                      Add a new financial account to track
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Account Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Chase Checking"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <Select
                        value={newAccount.account_type}
                        onValueChange={(v: AccountType) => {
                          // Auto-set net worth bucket based on account type
                          let bucket: NetWorthBucket = 'cash'
                          if (['credit_card', 'loan', 'mortgage'].includes(v)) {
                            bucket = 'liabilities'
                          } else if (v === 'investment') {
                            bucket = 'investments'
                          } else if (v === 'retirement') {
                            bucket = 'retirement'
                          }
                          setNewAccount({ ...newAccount, account_type: v, net_worth_bucket: bucket })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checking">Checking</SelectItem>
                          <SelectItem value="savings">Savings</SelectItem>
                          <SelectItem value="credit_card">Credit Card</SelectItem>
                          <SelectItem value="investment">Investment</SelectItem>
                          <SelectItem value="retirement">Retirement</SelectItem>
                          <SelectItem value="loan">Loan</SelectItem>
                          <SelectItem value="mortgage">Mortgage</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Net Worth Bucket</Label>
                      <Select
                        value={newAccount.net_worth_bucket}
                        onValueChange={(v: NetWorthBucket) =>
                          setNewAccount({ ...newAccount, net_worth_bucket: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="investments">Investments</SelectItem>
                          <SelectItem value="real_estate">Real Estate</SelectItem>
                          <SelectItem value="crypto">Crypto</SelectItem>
                          <SelectItem value="retirement">Retirement</SelectItem>
                          <SelectItem value="liabilities">Liabilities</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="institution">Institution (optional)</Label>
                      <Input
                        id="institution"
                        placeholder="e.g., Chase Bank"
                        value={newAccount.institution}
                        onChange={(e) => setNewAccount({ ...newAccount, institution: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="starting-balance">Starting Balance</Label>
                        <Input
                          id="starting-balance"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newAccount.starting_balance}
                          onChange={(e) => setNewAccount({ ...newAccount, starting_balance: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          {isLiabilityAccount(newAccount.account_type)
                            ? 'Enter as positive (amount owed)'
                            : 'Enter the current balance'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="starting-date">As of Date</Label>
                        <Input
                          id="starting-date"
                          type="date"
                          value={newAccount.starting_balance_date}
                          onChange={(e) => setNewAccount({ ...newAccount, starting_balance_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddAccount} disabled={isAddingAccount || !newAccount.name}>
                      {isAddingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Account
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Assets Section */}
              {accountsWithBalances.filter(a => a.is_active && !isLiabilityAccount(a.account_type)).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Assets</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Name</TableHead>
                        <TableHead className="w-[15%]">Type</TableHead>
                        <TableHead className="w-[15%] text-right">Balance</TableHead>
                        <TableHead className="w-[15%] text-right">Transactions</TableHead>
                        <TableHead className="w-[15%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountsWithBalances
                        .filter(a => a.is_active && !isLiabilityAccount(a.account_type))
                        .map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {account.name}
                                {account.institution && (
                                  <span className="text-xs text-muted-foreground">({account.institution})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {account.account_type.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {account.starting_balance !== null ? (
                                <span className={account.current_balance >= 0 ? 'text-green-600 font-medium' : 'text-red-500'}>
                                  {formatCurrency(account.current_balance)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">No balance set</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {account.transaction_count}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditAccountClick(account)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleAccountActive(account)}
                                  title="Deactivate account"
                                >
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteAccount(account.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Liabilities Section */}
              {accountsWithBalances.filter(a => a.is_active && isLiabilityAccount(a.account_type)).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Liabilities</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Name</TableHead>
                        <TableHead className="w-[15%]">Type</TableHead>
                        <TableHead className="w-[15%] text-right">Balance</TableHead>
                        <TableHead className="w-[15%] text-right">Transactions</TableHead>
                        <TableHead className="w-[15%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountsWithBalances
                        .filter(a => a.is_active && isLiabilityAccount(a.account_type))
                        .map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {account.name}
                                {account.institution && (
                                  <span className="text-xs text-muted-foreground">({account.institution})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {account.account_type.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {account.starting_balance !== null ? (
                                <span className="text-red-500 font-medium">
                                  -{formatCurrency(Math.abs(account.current_balance))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">No balance set</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {account.transaction_count}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditAccountClick(account)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleAccountActive(account)}
                                  title="Deactivate account"
                                >
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteAccount(account.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Inactive Section */}
              {accountsWithBalances.filter(a => !a.is_active).length > 0 && (
                <div>
                  <button
                    onClick={() => setShowInactive(!showInactive)}
                    className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide hover:text-foreground"
                  >
                    {showInactive ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Inactive ({accountsWithBalances.filter(a => !a.is_active).length})
                  </button>
                  {showInactive && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%]">Name</TableHead>
                          <TableHead className="w-[15%]">Type</TableHead>
                          <TableHead className="w-[45%]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accountsWithBalances
                          .filter(a => !a.is_active)
                          .map((account) => (
                            <TableRow key={account.id} className="opacity-60">
                              <TableCell className="font-medium">{account.name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="capitalize">
                                  {account.account_type.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleToggleAccountActive(account)}
                                    title="Activate account"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteAccount(account.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}

              {accountsWithBalances.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No accounts yet. Add your first account to get started.
                </div>
              )}

              {/* Edit Account Dialog */}
              <Dialog open={!!editAccount} onOpenChange={(open) => !open && setEditAccount(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Account</DialogTitle>
                    <DialogDescription>
                      Update account details and balance settings
                    </DialogDescription>
                  </DialogHeader>
                  {editAccount && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-name">Account Name</Label>
                        <Input
                          id="edit-name"
                          value={editAccount.name}
                          onChange={(e) => setEditAccount({ ...editAccount, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Account Type</Label>
                        <Select
                          value={editAccount.account_type}
                          onValueChange={(v: AccountType) =>
                            setEditAccount({ ...editAccount, account_type: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="checking">Checking</SelectItem>
                            <SelectItem value="savings">Savings</SelectItem>
                            <SelectItem value="credit_card">Credit Card</SelectItem>
                            <SelectItem value="investment">Investment</SelectItem>
                            <SelectItem value="retirement">Retirement</SelectItem>
                            <SelectItem value="loan">Loan</SelectItem>
                            <SelectItem value="mortgage">Mortgage</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Net Worth Bucket</Label>
                        <Select
                          value={editAccount.net_worth_bucket}
                          onValueChange={(v: NetWorthBucket) =>
                            setEditAccount({ ...editAccount, net_worth_bucket: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="investments">Investments</SelectItem>
                            <SelectItem value="real_estate">Real Estate</SelectItem>
                            <SelectItem value="crypto">Crypto</SelectItem>
                            <SelectItem value="retirement">Retirement</SelectItem>
                            <SelectItem value="liabilities">Liabilities</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-institution">Institution</Label>
                        <Input
                          id="edit-institution"
                          value={editAccount.institution}
                          onChange={(e) => setEditAccount({ ...editAccount, institution: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-starting-balance">Starting Balance</Label>
                          <Input
                            id="edit-starting-balance"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={editAccount.starting_balance}
                            onChange={(e) => setEditAccount({ ...editAccount, starting_balance: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-starting-date">As of Date</Label>
                          <Input
                            id="edit-starting-date"
                            type="date"
                            value={editAccount.starting_balance_date}
                            onChange={(e) => setEditAccount({ ...editAccount, starting_balance_date: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="edit-active"
                          checked={editAccount.is_active}
                          onCheckedChange={(checked) =>
                            setEditAccount({ ...editAccount, is_active: checked === true })
                          }
                        />
                        <Label htmlFor="edit-active">Active (include in balance tracking)</Label>
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditAccount(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateAccount} disabled={isEditingAccount || !editAccount?.name}>
                      {isEditingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Categories</CardTitle>
                <CardDescription>
                  Manage expense and income categories
                </CardDescription>
              </div>
              <Dialog open={dialogOpen === 'category'} onOpenChange={(o) => setDialogOpen(o ? 'category' : null)}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Category
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Category</DialogTitle>
                    <DialogDescription>
                      Add a new category for organizing transactions
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Category Level</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={!newCategory.isSubcategory ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNewCategory({ ...newCategory, isSubcategory: false, parent_id: null })}
                        >
                          Parent
                        </Button>
                        <Button
                          type="button"
                          variant={newCategory.isSubcategory ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNewCategory({ ...newCategory, isSubcategory: true })}
                          disabled={getParentCategories(categories).length === 0}
                        >
                          Subcategory
                        </Button>
                      </div>
                      {newCategory.isSubcategory && getParentCategories(categories).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Create a parent category first
                        </p>
                      )}
                    </div>
                    {newCategory.isSubcategory && (
                      <div className="space-y-2">
                        <Label>Parent Category</Label>
                        <Select
                          value={newCategory.parent_id || ''}
                          onValueChange={(v) => {
                            const parent = categories.find((c) => c.id === v)
                            setNewCategory({
                              ...newCategory,
                              parent_id: v,
                              type: parent?.type || newCategory.type,
                            })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select parent..." />
                          </SelectTrigger>
                          <SelectContent>
                            {getParentCategories(categories)
                              .filter((c) => !newCategory.type || c.type === newCategory.type || !newCategory.parent_id)
                              .map((parent) => (
                                <SelectItem key={parent.id} value={parent.id}>
                                  {parent.name} ({parent.type})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="cat-name">Category Name</Label>
                      <Input
                        id="cat-name"
                        placeholder={newCategory.isSubcategory ? 'e.g., Utilities' : 'e.g., House Expenses'}
                        value={newCategory.name}
                        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={newCategory.type}
                        onValueChange={(v: 'income' | 'expense' | 'transfer') =>
                          setNewCategory({ ...newCategory, type: v })
                        }
                        disabled={newCategory.isSubcategory && !!newCategory.parent_id}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                      {newCategory.isSubcategory && newCategory.parent_id && (
                        <p className="text-xs text-muted-foreground">
                          Type is inherited from parent category
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddCategory} disabled={isAddingCategory || !newCategory.name || (newCategory.isSubcategory && !newCategory.parent_id)}>
                      {isAddingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add {newCategory.isSubcategory ? 'Subcategory' : 'Category'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length > 0 ? (
                    buildCategoryTree(categories).map((parent: CategoryWithChildren) => (
                      <>
                        <TableRow key={parent.id} className="bg-muted/30">
                          <TableCell className="font-medium">
                            {parent.name}
                            {parent.children.length > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({parent.children.length} subcategories)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="capitalize">{parent.type}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditCategoryClick(parent)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteCategoryClick(parent)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {parent.children.map((child) => (
                          <TableRow key={child.id}>
                            <TableCell className="font-medium pl-8">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <ChevronRight className="h-3 w-3" />
                                {child.name}
                              </span>
                            </TableCell>
                            <TableCell className="capitalize">{child.type}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditCategoryClick(child)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteCategoryClick(child)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No categories yet. Create parent categories first, then add subcategories.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Delete confirmation dialog for parent categories with children */}
              <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Delete Parent Category?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      <strong>{deleteConfirm?.name}</strong> has {deleteConfirm?.childrenCount} subcategories.
                      Deleting this parent will orphan the subcategories (they will become top-level categories).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteConfirm && handleDeleteCategory(deleteConfirm.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Anyway
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Edit category dialog */}
              <Dialog open={!!editCategory} onOpenChange={(open) => !open && setEditCategory(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Category</DialogTitle>
                    <DialogDescription>
                      Update category name or assign to a parent category
                    </DialogDescription>
                  </DialogHeader>
                  {editCategory && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-cat-name">Category Name</Label>
                        <Input
                          id="edit-cat-name"
                          value={editCategory.name}
                          onChange={(e) => setEditCategory({ ...editCategory, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <div className="text-sm text-muted-foreground capitalize bg-muted px-3 py-2 rounded-md">
                          {editCategory.type}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Type cannot be changed (would break transaction mappings)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Parent Category</Label>
                        {editCategory.hasChildren ? (
                          <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
                            This is a parent category (has subcategories)
                          </div>
                        ) : (
                          <Select
                            value={editCategory.parent_id || 'none'}
                            onValueChange={(v) =>
                              setEditCategory({ ...editCategory, parent_id: v === 'none' ? null : v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- No Parent (Top Level) --</SelectItem>
                              {getParentCategories(categories)
                                .filter((c) => c.type === editCategory.type && c.id !== editCategory.id)
                                .map((parent) => (
                                  <SelectItem key={parent.id} value={parent.id}>
                                    {parent.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                        {!editCategory.hasChildren && editCategory.parent_id === null && (
                          <p className="text-xs text-muted-foreground">
                            Assign a parent to make this a subcategory
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditCategory(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateCategory} disabled={isEditingCategory || !editCategory?.name}>
                      {isEditingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QuickBooks Category Mappings Tab */}
        <TabsContent value="qb-mappings" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Category Mappings</CardTitle>
                <CardDescription>
                  Map QuickBooks account names to your expense categories for automatic categorization
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <CategoryMapping categories={categories} onCategoriesUpdate={loadData} />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
