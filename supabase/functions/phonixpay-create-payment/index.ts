import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PHONIXPAY_API = 'https://atetinneypazxfvqnosd.supabase.co/functions/v1/phonixpay-api';
const CHECKOUT_CODE = 'CKFN1SIX6R';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('PHONIXPAY_API_KEY');
    if (!apiKey) throw new Error('PHONIXPAY_API_KEY not configured');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Get the authenticated user from the bearer token
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const plan = body.plan ?? 'premium';

    // Build webhook URL pointing back to our own edge function
    const webhookUrl = `${SUPABASE_URL}/functions/v1/phonixpay-webhook`;

    const ppRes = await fetch(`${PHONIXPAY_API}/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-checkout-code': CHECKOUT_CODE,
      },
      body: JSON.stringify({
        webhook_url: webhookUrl,
        metadata: { user_id: user.id, plan, email: user.email },
      }),
    });

    const ppData = await ppRes.json();
    if (!ppRes.ok || !ppData?.payment) {
      return new Response(JSON.stringify({ error: 'PhonixPay error', details: ppData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payment = ppData.payment;

    // Store pending subscription row
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    await admin.from('subscriptions').insert({
      user_id: user.id,
      plan,
      status: 'pending',
      payment_reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      metadata: { checkout_code: CHECKOUT_CODE },
    });

    return new Response(JSON.stringify({ payment }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
