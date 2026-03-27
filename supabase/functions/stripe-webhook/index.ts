import Stripe from "npm:stripe@16.12.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-06-20"
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Stripe Webhook Env-Variablen fehlen.");
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return json({ error: "Stripe-Signatur fehlt." }, 400);
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
      const packageId = session.metadata?.package_id ?? null;
      const coins = Number(session.metadata?.coins ?? 0);

      if (!userId || !coins) {
        return json({ received: true, ignored: true, reason: "missing_user_or_coins" });
      }

      const sessionId = session.id;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      const customerId = typeof session.customer === "string" ? session.customer : null;

      const { data: existingPurchase, error: existingError } = await adminClient
        .from("purchases")
        .select("id, status")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingPurchase?.status === "completed") {
        return json({ received: true, deduplicated: true });
      }

      const { data: profileRow, error: fetchProfileError } = await adminClient
        .from("profiles")
        .select("coins")
        .eq("id", userId)
        .single();

      if (fetchProfileError) throw fetchProfileError;

      const { error: coinsError } = await adminClient
        .from("profiles")
        .update({ coins: (profileRow?.coins ?? 0) + coins })
        .eq("id", userId);

      if (coinsError) throw coinsError;

      const purchasePayload = {
        user_id: userId,
        package_id: packageId ?? "stripe_checkout",
        coins,
        amount_cents: session.amount_total ?? 0,
        currency: session.currency ?? "eur",
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        stripe_customer_id: customerId,
        stripe_event_id: event.id,
        status: "completed",
        credited_at: new Date().toISOString(),
        metadata: {
          checkout_session_id: sessionId
        }
      };

      if (existingPurchase?.id) {
        const { error: updatePurchaseError } = await adminClient
          .from("purchases")
          .update(purchasePayload)
          .eq("id", existingPurchase.id);

        if (updatePurchaseError) throw updatePurchaseError;
      } else {
        const { error: insertPurchaseError } = await adminClient
          .from("purchases")
          .insert(purchasePayload);

        if (insertPurchaseError) throw insertPurchaseError;
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;

      if (sessionId) {
        const { error } = await adminClient
          .from("purchases")
          .update({
            status: "expired",
            stripe_event_id: event.id
          })
          .eq("stripe_checkout_session_id", sessionId)
          .neq("status", "completed");

        if (error) {
          throw error;
        }
      }
    }

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook-Fehler";
    return json({ error: message }, 400);
  }
});
