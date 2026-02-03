import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NetWorthChart } from '@/components/charts/net-worth-chart'
import { NetWorthCard } from '@/components/dashboard/net-worth-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Investment, HomeEntry } from '@/types/database'
import { getAccountsWithBalances, isLiabilityAccount } from '@/lib/account-balance'

export default async function NetWorthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ========================================
  // NET WORTH: Auto-calculate from accounts
  // ========================================
  const accounts = user ? await getAccountsWithBalances(supabase, user.id) : []

  // Calculate net worth by account type
  let currentCash = 0
  let currentInvestments = 0
  let currentRealEstate = 0
  let currentCrypto = 0
  let currentRetirement = 0
  let currentLiabilities = 0

  for (const account of accounts) {
    if (!account.is_active) continue
    const balance = account.current_balance

    if (isLiabilityAccount(account.account_type)) {
      currentLiabilities += Math.abs(balance)
    } else {
      switch (account.account_type) {
        case 'checking':
        case 'savings':
          currentCash += balance
          break
        case 'investment':
          if (account.name.toLowerCase().includes('crypto')) {
            currentCrypto += balance
          } else {
            currentInvestments += balance
          }
          break
        case 'retirement':
          currentRetirement += balance
          break
        default:
          if (account.name.toLowerCase().includes('crypto')) {
            currentCrypto += balance
          } else if (account.name.toLowerCase().includes('house') || account.name.toLowerCase().includes('property') || account.name.toLowerCase().includes('real estate')) {
            currentRealEstate += balance
          } else {
            currentInvestments += balance
          }
      }
    }
  }

  const latestData = {
    date: new Date().toISOString(),
    netWorth: currentCash + currentInvestments + currentRealEstate + currentCrypto + currentRetirement - currentLiabilities,
    cash: currentCash,
    investments: currentInvestments,
    realEstate: currentRealEstate,
    crypto: currentCrypto,
    retirement: currentRetirement,
    liabilities: currentLiabilities,
  }

  // For now, no historical chart data
  const chartData: typeof latestData[] = []

  // Get latest investments (for investment holdings table)
  const { data: investments } = await supabase
    .from('investments')
    .select('*')
    .order('current_value', { ascending: false })
    .limit(20)

  // Get latest home entry
  const { data: homeEntryData } = await supabase
    .from('home_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .limit(1)
    .single()

  const homeEntry = homeEntryData as HomeEntry | null

  // Calculate totals from investments
  const investmentList = (investments || []) as Investment[]
  const investmentTotal = investmentList.reduce((sum, inv) => sum + (Number(inv.current_value) || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Net Worth</h1>
        <p className="text-muted-foreground">
          Detailed breakdown of your assets and liabilities
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <NetWorthCard bucket="cash" value={latestData.cash} />
        <NetWorthCard bucket="investments" value={latestData.investments} />
        <NetWorthCard bucket="real_estate" value={latestData.realEstate} />
        <NetWorthCard bucket="crypto" value={latestData.crypto} />
        <NetWorthCard bucket="retirement" value={latestData.retirement} />
        <NetWorthCard bucket="liabilities" value={latestData.liabilities} />
      </div>

      {/* Charts */}
      <Tabs defaultValue="line">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="line">Line Chart</TabsTrigger>
            <TabsTrigger value="stacked">Stacked Chart</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="line">
          <Card>
            <CardHeader>
              <CardTitle>Net Worth Over Time</CardTitle>
              <CardDescription>Your total net worth progression</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <NetWorthChart data={chartData} />
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
                  Historical net worth tracking coming soon. Current values are shown above.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stacked">
          <Card>
            <CardHeader>
              <CardTitle>Assets by Category</CardTitle>
              <CardDescription>Breakdown of assets over time</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <NetWorthChart data={chartData} stacked />
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
                  Historical asset breakdown coming soon. Current values are shown above.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detailed Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Investments */}
        <Card>
          <CardHeader>
            <CardTitle>Investment Holdings</CardTitle>
            <CardDescription>
              Total: {formatCurrency(investmentTotal || latestData.investments)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investmentList.length > 0 ? (
                  investmentList.slice(0, 10).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.symbol}</TableCell>
                      <TableCell>{Number(inv.quantity).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(inv.current_value) || 0)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No investments imported yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Real Estate */}
        <Card>
          <CardHeader>
            <CardTitle>Real Estate</CardTitle>
            <CardDescription>
              Total Equity: {formatCurrency(homeEntry?.equity || latestData.realEstate)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {homeEntry ? (
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property</span>
                  <span className="font-medium">{homeEntry.property_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Home Value</span>
                  <span className="font-medium">{formatCurrency(Number(homeEntry.home_value))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mortgage Balance</span>
                  <span className="font-medium text-red-500">
                    -{formatCurrency(Number(homeEntry.mortgage_balance))}
                  </span>
                </div>
                <div className="border-t pt-4 flex justify-between">
                  <span className="font-medium">Equity</span>
                  <span className="font-bold text-green-600">
                    {formatCurrency(Number(homeEntry.equity))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  As of {formatDate(homeEntry.entry_date)}
                </p>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No home value entered yet. Go to Settings to add your property.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Account Balances */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account Balances</CardTitle>
            <CardDescription>All tracked accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length > 0 ? (
                  accounts
                    .filter(a => a.is_active)
                    .sort((a, b) => {
                      // Sort: assets first (positive balances), then liabilities
                      const aIsLiability = isLiabilityAccount(a.account_type)
                      const bIsLiability = isLiabilityAccount(b.account_type)
                      if (aIsLiability !== bIsLiability) return aIsLiability ? 1 : -1
                      return Math.abs(b.current_balance) - Math.abs(a.current_balance)
                    })
                    .map((account) => {
                      const isLiability = isLiabilityAccount(account.account_type)
                      return (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">{account.name}</TableCell>
                          <TableCell className="capitalize">
                            {account.account_type.replace('_', ' ')}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${isLiability ? 'text-red-500' : 'text-green-600'}`}>
                            {isLiability ? '-' : ''}{formatCurrency(Math.abs(account.current_balance))}
                          </TableCell>
                        </TableRow>
                      )
                    })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No accounts created yet. Go to Accounts to add accounts.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
