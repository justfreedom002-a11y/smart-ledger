import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  const adminClient = createClient(url, serviceRoleKey);
  const { data: profile, error: profileError } = await adminClient
    .from("profiles").select("role,is_active").eq("id", user.id).single();
  if (profileError || !profile || profile.role !== "admin" || !profile.is_active) {
    return json({ error: "Admin permission required" }, 403);
  }

  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json({ error: "User ID must be 3-40 letters, numbers, dots, underscores or hyphens" }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

  const email = `${username}@smartledger.local`;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username }
  });
  if (createError || !created.user) return json({ error: createError?.message || "Could not create auth user" }, 400);

  const { error: insertError } = await adminClient.from("profiles").insert({
    id: created.user.id, username, role: "user", is_active: true
  });
  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: insertError.message }, 400);
  }
  await adminClient.from("audit_logs").insert({ user_id: user.id, action: "create_user", details: { username } });
  return json({ ok: true, username }, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
