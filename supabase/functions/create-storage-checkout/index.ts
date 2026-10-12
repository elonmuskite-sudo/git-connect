import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'
import { STORAGE_TIERS } from '../_shared/storage-tiers.ts'

const Body = z.object({ tier: z.string(), returnUrl: z.string().url() })
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) return json({ error: 'Payments are not set up yet.' }, 503)

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Sign in required.' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json({ error: 'Sign in required.' }, 401)

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400)
    const tier = STORAGE_TIERS[parsed.data.tier]
    if (!tier) return json({ error: 'Unknown storage plan.' }, 400)

    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(tier.amountCents),
      'line_items[0][price_data][product_data][name]': tier.label,
      success_url: `${parsed.data.returnUrl}?purchase=success`,
      cancel_url: `${parsed.data.returnUrl}?purchase=cancelled`,
      client_reference_id: user.id,
      'metadata[user_id]': user.id,
      'metadata[tier]': parsed.data.tier,
      'payment_intent_data[receipt_email]': user.email ?? '',
    })
    if (user.email) params.set('customer_email', user.email)

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    const session = await res.json()
    if (!res.ok) return json({ error: session?.error?.message || 'Checkout failed.' }, 502)

    await admin.from('storage_purchases').insert({
      user_id: user.id, tier: parsed.data.tier, added_bytes: tier.addedBytes,
      amount_cents: tier.amountCents, currency: 'usd', status: 'pending', checkout_session_id: session.id,
    })
    return json({ url: session.url })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
