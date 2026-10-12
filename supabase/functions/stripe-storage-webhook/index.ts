import Stripe from 'npm:stripe@17'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!key || !secret) return new Response('Not configured', { status: 503 })
  const stripe = new Stripe(key)
  const sig = req.headers.get('stripe-signature') ?? ''
  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret)
  } catch {
    return new Response('Bad signature', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: purchase } = await admin.from('storage_purchases')
      .select('*').eq('checkout_session_id', session.id).maybeSingle()
    if (purchase && purchase.status !== 'paid') {
      let receiptUrl: string | null = null
      if (session.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), { expand: ['latest_charge'] })
        receiptUrl = (pi.latest_charge as Stripe.Charge | null)?.receipt_url ?? null
      }
      await admin.from('storage_purchases').update({ status: 'paid', receipt_url: receiptUrl }).eq('id', purchase.id)
      const { data: quota } = await admin.from('user_storage_quotas').select('quota_bytes').eq('user_id', purchase.user_id).maybeSingle()
      const base = Number(quota?.quota_bytes ?? 5368709120)
      await admin.from('user_storage_quotas').upsert({ user_id: purchase.user_id, quota_bytes: base + Number(purchase.added_bytes) })
    }
  }
  return new Response('ok')
})
