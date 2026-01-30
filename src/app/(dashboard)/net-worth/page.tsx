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
import type { NetWorthSnapshot, Investment, HomeEntry, Account, AccountBalance } from '@/types/database'

type AccountWithBalances = Account & {
  account_balances: Pick<AccountBalance, 'balance' | 'balance_date'>[]
}

export default async function NetWorthPage() {
  const supabase = await createClient()

  // Get net worth history
  const { data: netWorthHistory } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })
    .limit(24)

  // Get latest investments
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

  // Get account balances
  const { data: accounts } = await supabase
    .from('accounts')
    .select(`
      *,
      account_balances (
        balance,
        balance_date
      )
    `)
    .eq('is_active', true)
    .order('name')

  const history = (netWorthHistory || []) as NetWorthSnapshot[]
  const chartData = history.map(s => ({
    date: s.snapshot_date,
    netWorth: Number(s.net_worth),
    cash: Number(s.cash),
    investments: Number(s.investments),
    realEstate: Number(s.real_estate),
    crypto: Number(s.crypto),
    retirement: Number(s.retirement),
    liabilities: Number(s.liabilities),
  }))

  const latestData = chartData[chartData.length - 1] || {
    date: new Date().toISOString(),
    netWorth: 0,
    cash: 0,
    investments: 0,
    realEstate: 0,
    crypto: 0,
    retirement: 0,
    liabilities: 0,
  }

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
                  No net worth history yet. Create a snapshot in Settings.
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
                  No net worth history yet. Create a snapshot in Settings.
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
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accounts as AccountWithBalances[] || []).length > 0 ? (
                  (accounts as AccountWithBalances[]).map((account) => {
                    const latestBalance = account.account_balances?.[0]?.balance
                    return (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="capitalize">
                          {account.account_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="capitalize">
                          {account.net_worth_bucket.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="text-right">
                          {latestBalance !== undefined
                            ? formatCurrency(Number(latestBalance))
                            : '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No accounts created yet. Go to Settings to add accounts.
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
