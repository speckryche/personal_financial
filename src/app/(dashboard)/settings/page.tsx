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
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CategoryMapping } from '@/components/settings/category-mapping'
import { TransactionTypeMapping } from '@/components/settings/transaction-type-mapping'
import type { Account, AccountType, NetWorthBucket, Category, HomeEntry } from '@/types/database'

export default function SettingsPage() {
  const supabase = createClient()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [homeEntries, setHomeEntries] = useState<HomeEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Form states
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'checking' as AccountType,
    net_worth_bucket: 'cash' as NetWorthBucket,
    institution: '',
  })

  const [newCategory, setNewCategory] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
  })

  const [newHomeEntry, setNewHomeEntry] = useState({
    property_name: 'Primary Residence',
    home_value: '',
    mortgage_balance: '',
    notes: '',
  })

  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [isAddingHome, setIsAddingHome] = useState(false)
  const [dialogOpen, setDialogOpen] = useState<'account' | 'category' | 'home' | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [accountsRes, categoriesRes, homeRes] = await Promise.all([
      supabase.from('accounts').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('home_entries').select('*').order('entry_date', { ascending: false }),
    ])

    if (accountsRes.data) setAccounts(accountsRes.data)
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (homeRes.data) setHomeEntries(homeRes.data)
    setLoading(false)
  }

  const handleAddAccount = async () => {
    if (!newAccount.name) return
    setIsAddingAccount(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: newAccount.name,
      account_type: newAccount.account_type,
      net_worth_bucket: newAccount.net_worth_bucket,
      institution: newAccount.institution || null,
    })

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({ title: 'Account added successfully' })
      setNewAccount({
        name: '',
        account_type: 'checking',
        net_worth_bucket: 'cash',
        institution: '',
      })
      setDialogOpen(null)
      loadData()
    }
    setIsAddingAccount(false)
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
    setIsAddingCategory(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      name: newCategory.name,
      type: newCategory.type,
    })

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Category added successfully' })
      setNewCategory({ name: '', type: 'expense' })
      setDialogOpen(null)
      loadData()
    }
    setIsAddingCategory(false)
  }

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Category deleted' })
      loadData()
    }
  }

  const handleAddHomeEntry = async () => {
    if (!newHomeEntry.home_value) return
    setIsAddingHome(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('home_entries').insert({
      user_id: user.id,
      property_name: newHomeEntry.property_name,
      entry_date: new Date().toISOString().split('T')[0],
      home_value: parseFloat(newHomeEntry.home_value),
      mortgage_balance: parseFloat(newHomeEntry.mortgage_balance) || 0,
      notes: newHomeEntry.notes || null,
    })

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Home entry added successfully' })
      setNewHomeEntry({
        property_name: 'Primary Residence',
        home_value: '',
        mortgage_balance: '',
        notes: '',
      })
      setDialogOpen(null)
      loadData()
    }
    setIsAddingHome(false)
  }

  const handleDeleteHomeEntry = async (id: string) => {
    const { error } = await supabase.from('home_entries').delete().eq('id', id)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Home entry deleted' })
      loadData()
    }
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

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="qb-types">QB Types</TabsTrigger>
          <TabsTrigger value="qb-mappings">QB Categories</TabsTrigger>
          <TabsTrigger value="home">Home Value</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>
                  Manage your bank accounts, credit cards, and investment accounts
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
                        onValueChange={(v: AccountType) =>
                          setNewAccount({ ...newAccount, account_type: v })
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
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length > 0 ? (
                    accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="capitalize">
                          {account.account_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="capitalize">
                          {account.net_worth_bucket.replace('_', ' ')}
                        </TableCell>
                        <TableCell>{account.institution || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAccount(account.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No accounts yet. Add your first account to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
                      <Label htmlFor="cat-name">Category Name</Label>
                      <Input
                        id="cat-name"
                        placeholder="e.g., Groceries"
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
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddCategory} disabled={isAddingCategory || !newCategory.name}>
                      {isAddingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Category
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
                    categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="capitalize">{category.type}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCategory(category.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No categories yet. Default categories will be created when you sign up.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QuickBooks Transaction Types Tab */}
        <TabsContent value="qb-types" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Transaction Type Mappings</CardTitle>
                <CardDescription>
                  Map QuickBooks transaction types (Check, Deposit, etc.) to Income or Expense
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TransactionTypeMapping />
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

        {/* Home Value Tab */}
        <TabsContent value="home" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Home Value</CardTitle>
                <CardDescription>
                  Track your property value and mortgage balance
                </CardDescription>
              </div>
              <Dialog open={dialogOpen === 'home'} onOpenChange={(o) => setDialogOpen(o ? 'home' : null)}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Entry
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Home Value Entry</DialogTitle>
                    <DialogDescription>
                      Record your current home value and mortgage balance
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="property">Property Name</Label>
                      <Input
                        id="property"
                        placeholder="e.g., Primary Residence"
                        value={newHomeEntry.property_name}
                        onChange={(e) =>
                          setNewHomeEntry({ ...newHomeEntry, property_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="home-value">Home Value ($)</Label>
                      <Input
                        id="home-value"
                        type="number"
                        placeholder="500000"
                        value={newHomeEntry.home_value}
                        onChange={(e) =>
                          setNewHomeEntry({ ...newHomeEntry, home_value: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mortgage">Mortgage Balance ($)</Label>
                      <Input
                        id="mortgage"
                        type="number"
                        placeholder="300000"
                        value={newHomeEntry.mortgage_balance}
                        onChange={(e) =>
                          setNewHomeEntry({ ...newHomeEntry, mortgage_balance: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Input
                        id="notes"
                        placeholder="e.g., Based on Zillow estimate"
                        value={newHomeEntry.notes}
                        onChange={(e) =>
                          setNewHomeEntry({ ...newHomeEntry, notes: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddHomeEntry} disabled={isAddingHome || !newHomeEntry.home_value}>
                      {isAddingHome && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Entry
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Home Value</TableHead>
                    <TableHead className="text-right">Mortgage</TableHead>
                    <TableHead className="text-right">Equity</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {homeEntries.length > 0 ? (
                    homeEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.entry_date)}</TableCell>
                        <TableCell className="font-medium">{entry.property_name}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(entry.home_value))}
                        </TableCell>
                        <TableCell className="text-right text-red-500">
                          -{formatCurrency(Number(entry.mortgage_balance))}
                        </TableCell>
                        <TableCell className="text-right text-green-500 font-medium">
                          {formatCurrency(Number(entry.equity))}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteHomeEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No home value entries yet. Add your property details to track real estate equity.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
