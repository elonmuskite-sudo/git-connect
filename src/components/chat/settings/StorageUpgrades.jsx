import { useEffect, useState } from 'react'
import { LoaderCircle, Receipt, Sparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/AuthContext'
import { formatBytes } from '../../../lib/storageManager'

const TIERS = [
  { id: 'plus_50', label: '+50 GB', price: '$1.99' },
  { id: 'plus_200', label: '+200 GB', price: '$4.99' },
  { id: 'plus_1000', label: '+1 TB', price: '$14.99' },
]

export default function StorageUpgrades() {
  const { user } = useAuth()
  const [purchases, setPurchases] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const status = new URLSearchParams(window.location.search).get('purchase')

  useEffect(() => {
    if (!supabase || !user?.id) return
    supabase.from('storage_purchases').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setPurchases(data || []))
  }, [user?.id])

  const buy = async (tier) => {
    setBusy(tier); setError('')
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-storage-checkout', {
        body: { tier, returnUrl: `${window.location.origin}/app/settings/storage` },
      })
      if (fnError) throw new Error(data?.error || fnError.message)
      if (!data?.url) throw new Error(data?.error || 'Checkout could not start.')
      window.location.href = data.url
    } catch (err) {
      setError(err.message || 'Checkout could not start.')
      setBusy('')
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="font-semibold text-foreground">Get more storage</p>
      </div>
      {status === 'success' && <p className="text-sm text-primary">Payment received — your new limit appears once the payment is confirmed, and a receipt is emailed to you.</p>}
      {status === 'cancelled' && <p className="text-sm text-muted-foreground">Checkout cancelled.</p>}
      <div className="grid grid-cols-3 gap-2">
        {TIERS.map((t) => (
          <button key={t.id} onClick={() => buy(t.id)} disabled={!!busy}
            className="rounded-xl border border-border bg-muted/30 p-3 text-center hover:border-primary transition disabled:opacity-50">
            <p className="font-bold text-foreground">{t.label}</p>
            <p className="text-sm text-muted-foreground">{busy === t.id ? <LoaderCircle className="mx-auto w-4 h-4 animate-spin" /> : `${t.price} one-time`}</p>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {purchases.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Receipts</p>
          <ul className="space-y-1">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <span className="flex-1 text-foreground">{formatBytes(p.added_bytes)} · ${(p.amount_cents / 100).toFixed(2)} · {new Date(p.created_at).toLocaleDateString()}</span>
                <span className="text-muted-foreground">{p.status}</span>
                {p.receipt_url && <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">View</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
