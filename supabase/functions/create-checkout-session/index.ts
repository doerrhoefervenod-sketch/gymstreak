import Stripe from "npm:stripe@16.12.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getCoinPackageById } from "../_shared/coin-packages.ts";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const siteUrl = Deno.env.get("SITE_URL") ?? "";

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
  console.log("Funktion gestartet");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY fehlt in den Environment Variables.");
    }

    if (!stripeSecretKey.startsWith("sk_")) {
      throw new Error("STRIPE_SECRET_KEY ist gesetzt, hat aber kein gueltiges Stripe-Format.");
    }
    console.log("Stripe Key geladen");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase Environment Variables fehlen.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Nicht angemeldet." }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Session ungültig." }, 401);
    }

    const reqBody = await req.json();
    console.log("Empfangener Body: " + JSON.stringify(reqBody));
    const packageId = String(reqBody?.packageId ?? "");
    const returnUrl = String(reqBody?.returnUrl ?? "").trim();

    const pkg = getCoinPackageById(packageId);
    if (!pkg) {
      return json({ error: "Unbekanntes Coin-Paket." }, 400);
    }

    const stripePriceId = Deno.env.get(pkg.priceEnvVar) ?? "";
    if (!stripePriceId) {
      throw new Error(`Stripe Price ID fehlt für ${packageId}.`);
    }
    console.log("Nutze Price ID: " + stripePriceId);

    const appUrl = returnUrl || req.headers.get("origin") || siteUrl;
    if (!appUrl) {
      throw new Error("Keine App-URL für Stripe Redirect gefunden.");
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              price: stripePriceId,
              quantity: 1
            }
          ],
          success_url: `${appUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}?checkout=cancelled`,
          client_reference_id: user.id,
          customer_email: user.email ?? undefined,
          metadata: {
            user_id: user.id,
            package_id: pkg.id,
            coins: String(pkg.coins)
          },
          payment_intent_data: {
            metadata: {
              user_id: user.id,
              package_id: pkg.id,
              coins: String(pkg.coins)
            }
          }
        }
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("STRIPE FEHLER DETAIL: " + detail);
      throw error;
    }
    console.log("Session erstellt");

    return json({
      url: session.url,
      sessionId: session.id,
      packageId: pkg.id
    });
  } catch (error) {
    console.error("Stripe Error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    const status = message.includes("fehlt") || message.includes("ungueltig") || message.includes("Unbekanntes")
      ? 400
      : 500;
    return json({ error: message }, status);
  }
});
