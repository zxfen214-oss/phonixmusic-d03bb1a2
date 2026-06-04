import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PHONIXPAY_API = 'https://atetinneypazxfvqnosd.supabase.co/functions/v1/phonixpay-api';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('PHONIXPAY_API_KEY')!;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { reference } = await req.json();
    if (!reference) {
      return new Response(JSON.stringify({ error: 'reference required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vRes = await fetch(
      `${PHONIXPAY_API}/verify-payment?reference=${encodeURIComponent(reference)}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const vData = await vRes.json();

    if (!vData?.success || vData.payment?.status !== 'completed') {
      return new Response(JSON.stringify({ verified: false, payment: vData?.payment ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Ensure this reference belongs to this user (was created via our create-payment)
    const { data: existing } = await admin
      .from('subscriptions')
      .select('id, user_id, status')
      .eq('payment_reference', reference)
      .maybeSingle();

    if (!existing || existing.user_id !== user.id) {
      return new Response(JSON.stringify({ verified: false, error: 'Reference mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existing.status !== 'active') {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await admin.from('subscriptions').update({
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
        amount: vData.payment.amount,
        currency: vData.payment.currency ?? 'USD',
        updated_at: now.toISOString(),
      }).eq('id', existing.id);
    }

    return new Response(JSON.stringify({ verified: true, payment: vData.payment }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
