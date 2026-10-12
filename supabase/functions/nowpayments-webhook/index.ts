import { createClient } from 'npm:@supabase/supabase-js@2'

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.keys(v as Record<string, unknown>).sort().reduce((acc, k) => {
      acc[k] = sortKeys((v as Record<string, unknown>)[k]); return acc
    }, {} as Record<string, unknown>)
  }
  return v
}

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const GB = 1024 ** 3

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOWPAYMENTS_IPN_SECRET')
  if (!secret) return new Response('Not configured', { status: 503 })
  const raw = await req.text()
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return new Response('Bad body', { status: 400 }) }
  const expected = await hmacHex(secret, JSON.stringify(sortKeys(body)))
  if (expected !== (req.headers.get('x-nowpayments-sig') || '')) return new Response('Bad signature', { status: 400 })

  const status = String(body.payment_status || '')
  const orderId = String(body.order_id || '')
  if (!orderId) return new Response('ok')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (['failed', 'expired', 'refunded'].includes(status)) {
    await admin.from('storage_purchases').update({ status }).eq('id', orderId).eq('status', 'pending')
    return new Response('ok')
  }
  if (status !== 'finished') return new Response('ok')

  // Atomic claim so retries never add storage twice
  const { data: purchase } = await admin.from('storage_purchases')
    .update({ status: 'paid' }).eq('id', orderId).neq('status', 'paid').select('*').maybeSingle()
  if (!purchase) return new Response('ok')

  const { data: quota } = await admin.from('user_storage_quotas').select('quota_bytes').eq('user_id', purchase.user_id).maybeSingle()
  const newQuota = Number(quota?.quota_bytes ?? 5 * GB) + Number(purchase.added_bytes)
  await admin.from('user_storage_quotas').upsert({ user_id: purchase.user_id, quota_bytes: newQuota })

  // Email receipt via Resend
  try {
    const { data: { user } } = await admin.auth.admin.getUserById(purchase.user_id)
    const lovableKey = Deno.env.get('LOVABLE_API_KEY'); const resendKey = Deno.env.get('RESEND_API_KEY')
    if (user?.email && lovableKey && resendKey) {
      const amount = (purchase.amount_cents / 100).toFixed(2)
      const added = purchase.added_bytes >= 1000 * GB ? '1 TB' : `${Math.round(purchase.added_bytes / GB)} GB`
      await fetch('https://connector-gateway.lovable.dev/resend/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('RECEIPT_FROM_EMAIL') || 'Receipts <onboarding@resend.dev>',
          to: [user.email],
          subject: `Receipt: +${added} storage`,
          html: `<h2>Thanks for your purchase</h2><p>+${added} storage — $${amount} USD</p><p>Order: ${purchase.id}<br/>Payment: ${body.payment_id ?? ''}<br/>Date: ${new Date().toUTCString()}</p><p>Your new storage limit is ${(newQuota / GB).toFixed(0)} GB.</p>${purchase.receipt_url ? `<p><a href="${purchase.receipt_url}">View payment</a></p>` : ''}`,
        }),
      })
    }
  } catch (e) { console.error('receipt email failed', e) }

  return new Response('ok')
})
