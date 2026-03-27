const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const SUPABASE_URL_PLACEHOLDER = "PLACEHOLDER_SUPABASE_URL";
const SUPABASE_ANON_PLACEHOLDER = "PLACEHOLDER_SUPABASE_ANON_KEY";

function isPlaceholder(value) {
  return !value || value.startsWith("YOUR_") || value.startsWith("PLACEHOLDER_");
}

function getSupabaseLib() {
  if (typeof window === "undefined") return null;
  return window.supabase || null;
}

export function isSupabaseConfigured() {
  return !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON);
}

let supabase = null;

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase ist noch nicht in der .env konfiguriert.");
  }

  if (supabase) return supabase;

  const lib = getSupabaseLib();
  if (!lib || typeof lib.createClient !== "function") {
    throw new Error("Supabase JS konnte nicht geladen werden.");
  }

  supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON);
  return supabase;
}

function sanitizeUsername(value) {
  const base = (value || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18);

  return base || "user";
}

function fallbackUsernameForUser(user) {
  const emailBase = user?.email ? user.email.split("@")[0] : "user";
  const safeBase = sanitizeUsername(emailBase);
  const suffix = (user?.id || "guest").replace(/-/g, "").slice(0, 6) || "guest";
  return `${safeBase}_${suffix}`;
}

function normalizeInviteCode(value) {
  return (value || "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function ensureProfileRow() {
  const client = requireSupabase();
  const session = await getSession();
  if (!session) return null;

  const { data: existing, error: selectError } = await client
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const username = fallbackUsernameForUser(session.user);
  const payload = {
    id: session.user.id,
    username,
    avatar_url: session.user.user_metadata?.avatar_url || null
  };

  const { data, error } = await client
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function signUp(email, password, username) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });
    if (error) throw error;
    return { user: data.user, session: data.session, needsConfirmation: !data.session };
  } catch (err) {
    console.error("[signUp]", err.message);
    throw err;
  }
}

export async function signIn(email, password) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user, session: data.session };
  } catch (err) {
    console.error("[signIn]", err.message);
    throw err;
  }
}

export async function signOut() {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  } catch (err) {
    console.error("[signOut]", err.message);
    throw err;
  }
}

export async function getSession() {
  try {
    const client = requireSupabase();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    return session;
  } catch (err) {
    console.error("[getSession]", err.message);
    return null;
  }
}

export function onAuthChange(callback) {
  const client = requireSupabase();
  return client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

export async function fetchUserData() {
  try {
    return await ensureProfileRow();
  } catch (err) {
    console.error("[fetchUserData]", err.message);
    throw err;
  }
}

export async function updateProfile(fields) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");

    const { data, error } = await client
      .from("profiles")
      .update(fields)
      .eq("id", session.user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[updateProfile]", err.message);
    throw err;
  }
}

export async function setupProfile(username, character, rhythm) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");

    const existing = await ensureProfileRow();

    const { data, error } = await client
      .from("profiles")
      .upsert({
        id: session.user.id,
        username: sanitizeUsername(username) + "_" + session.user.id.replace(/-/g, "").slice(0, 6),
        avatar_url: existing?.avatar_url || session.user.user_metadata?.avatar_url || null,
        character,
        workout_rhythm: rhythm,
        onboarding_completed: true,
        current_streak: existing?.current_streak ?? 0,
        cycle_count: existing?.cycle_count ?? 0,
        coins: existing?.coins ?? 0,
        freezer_count: existing?.freezer_count ?? 1,
        unlocked_milestones: existing?.unlocked_milestones ?? []
      }, {
        onConflict: "id"
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[setupProfile]", err.message);
    throw err;
  }
}

export async function completeExistingProfile(fields) {
  try {
    return await updateProfile({
      ...fields,
      onboarding_completed: true
    });
  } catch (err) {
    console.error("[completeExistingProfile]", err.message);
    throw err;
  }
}

export async function checkUsernameAvailable(username) {
  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (error) throw error;
    return !data;
  } catch (err) {
    console.error("[checkUsername]", err.message);
    throw err;
  }
}

export async function logWorkout(type, category, duration) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");
    const uid = session.user.id;

    const { error: wkErr } = await client
      .from("workouts")
      .insert({ user_id: uid, type, category, duration });

    if (wkErr) throw wkErr;

    const profile = await fetchUserData();
    const now = Date.now();
    const newStreak = profile.current_streak + 1;
    const newCycles = profile.cycle_count + 1;
    const newCoins = profile.coins + 10;
    let newFreezers = profile.freezer_count;
    if (newCycles % 10 === 0) newFreezers++;

    const { data, error: upErr } = await client
      .from("profiles")
      .update({
        current_streak: newStreak,
        cycle_count: newCycles,
        coins: newCoins,
        freezer_count: newFreezers,
        last_workout_ts: now,
        next_due_ts: now + profile.workout_rhythm * 86400000
      })
      .eq("id", uid)
      .select()
      .single();

    if (upErr) throw upErr;
    return { profile: data, earnedFreezer: newCycles % 10 === 0 };
  } catch (err) {
    console.error("[logWorkout]", err.message);
    throw err;
  }
}

export async function fetchWorkoutHistory(dayRange) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");

    const since = new Date();
    since.setDate(since.getDate() - (dayRange || 30));

    const { data, error } = await client
      .from("workouts")
      .select("*")
      .eq("user_id", session.user.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("[fetchWorkoutHistory]", err.message);
    throw err;
  }
}

export async function createCoinCheckoutSession(packageId, returnUrl) {
  try {
    const supabase = requireSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    console.log("Session:", session?.access_token ? "exists" : "NULL");
    console.log("[createCoinCheckoutSession] Before request:", {
      packageId,
      returnUrl,
      hasClient: !!supabase,
      hasSession: !!session,
      userId: session?.user?.id || null
    });

    if (!session || !session.access_token || !session.user) {
      throw new Error("Bitte einloggen");
    }

    const functionUrl = `${SUPABASE_URL}/functions/v1/create-checkout-session`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_ANON
      },
      body: JSON.stringify({
        packageId,
        returnUrl
      })
    });

    console.log("[createCoinCheckoutSession] After request:", {
      status: response.status,
      ok: response.ok,
      functionUrl
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error("[createCoinCheckoutSession] Response JSON parse failed:", parseError);
    }

    console.log("[createCoinCheckoutSession] Response payload:", payload);

    if (!response.ok) {
      throw new Error(payload.error || `Edge Function Fehler (${response.status})`);
    }

    if (!payload || !payload.url) {
      throw new Error(payload.error || "Stripe Checkout konnte nicht gestartet werden.");
    }

    return payload;
  } catch (err) {
    console.error("[createCoinCheckoutSession]", err);
    throw err;
  }
}

export async function fetchPurchaseBySessionId(sessionId) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");

    const { data, error } = await client
      .from("purchases")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (err) {
    console.error("[fetchPurchaseBySessionId]", err.message);
    throw err;
  }
}

export async function createGroup(name, description) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");
    const uid = session.user.id;

    let group = null;
    let gErr = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const inviteCode = generateInviteCode();
      const result = await client
        .from("groups")
        .insert({ name, description, admin_id: uid, invite_code: inviteCode })
        .select()
        .single();

      group = result.data;
      gErr = result.error;

      if (!gErr) break;
      if (gErr.code !== "23505") throw gErr;
      if (!/invite_code/i.test(gErr.message || "")) throw gErr;
    }

    if (gErr || !group) throw gErr || new Error("Gruppe konnte nicht erstellt werden.");

    const { error: mErr } = await client
      .from("group_members")
      .insert({ group_id: group.id, user_id: uid });

    if (mErr) throw mErr;
    return group;
  } catch (err) {
    console.error("[createGroup]", err.message);
    throw err;
  }
}

export async function joinGroup(inviteCode) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");
    const normalizedCode = normalizeInviteCode(inviteCode);
    if (!normalizedCode || normalizedCode.length !== 6) {
      throw new Error("Bitte gib einen gültigen 6-stelligen Einladungscode ein.");
    }
    const { data, error } = await client.rpc("join_group_by_code", {
      p_invite_code: normalizedCode
    });

    if (error) throw error;
    if (!data || !data.length) {
      throw new Error("Gruppe nicht gefunden. Prüfe den Einladungscode.");
    }

    return data[0];
  } catch (err) {
    console.error("[joinGroup]", err.message);
    throw err;
  }
}

export async function joinGroupByCode(inviteCode) {
  return joinGroup(inviteCode);
}

export async function fetchUserGroups() {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");

    const { data, error } = await client
      .from("group_members")
      .select("group_id, groups(id, name, description, invite_code, admin_id, created_at)")
      .eq("user_id", session.user.id);

    if (error) throw error;
    return (data || []).map((row) => row.groups);
  } catch (err) {
    console.error("[fetchUserGroups]", err.message);
    throw err;
  }
}

export async function getGroupRanking(groupId) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.rpc("get_group_ranking", { p_group_id: groupId });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("[getGroupRanking]", err.message);
    throw err;
  }
}

export async function leaveGroup(groupId) {
  try {
    const client = requireSupabase();
    const session = await getSession();
    if (!session) throw new Error("Not authenticated");

    const { error } = await client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", session.user.id);

    if (error) throw error;
  } catch (err) {
    console.error("[leaveGroup]", err.message);
    throw err;
  }
}

export async function buyFreezer(coinCost, freezerCount) {
  try {
    const profile = await fetchUserData();
    if (profile.coins < coinCost) throw new Error("Nicht genug Coins");

    return await updateProfile({
      coins: profile.coins - coinCost,
      freezer_count: profile.freezer_count + freezerCount
    });
  } catch (err) {
    console.error("[buyFreezer]", err.message);
    throw err;
  }
}

export async function addCoins(amount) {
  try {
    const profile = await fetchUserData();
    return await updateProfile({ coins: profile.coins + amount });
  } catch (err) {
    console.error("[addCoins]", err.message);
    throw err;
  }
}

export async function normalizeStreak() {
  try {
    const profile = await fetchUserData();
    if (!profile || !profile.last_workout_ts) return profile;

    const now = Date.now();
    const interval = profile.workout_rhythm * 86400000;
    let ts = profile.last_workout_ts;
    let nd = ts + interval;
    let sk = profile.current_streak;
    let cc = profile.cycle_count;
    let fz = profile.freezer_count;
    let ra = profile.streak_reset_at;
    let changed = false;

    while (now > nd + 86400000) {
      if (fz > 0) {
        fz--;
        ts = nd;
        nd = ts + interval;
        changed = true;
      } else {
        sk = 0;
        cc = 0;
        ts = null;
        ra = now;
        changed = true;
        break;
      }
    }

    if (changed) {
      return await updateProfile({
        current_streak: sk,
        cycle_count: cc,
        freezer_count: fz,
        last_workout_ts: ts,
        next_due_ts: ts ? ts + interval : null,
        streak_reset_at: ra
      });
    }

    return profile;
  } catch (err) {
    console.error("[normalizeStreak]", err.message);
    throw err;
  }
}

export {
  SUPABASE_URL,
  SUPABASE_ANON,
  SUPABASE_URL_PLACEHOLDER,
  SUPABASE_ANON_PLACEHOLDER
};
