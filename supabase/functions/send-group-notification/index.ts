// Supabase Edge Function: send-group-notification
//
// Handles two events:
// 1. group_invitation: notify the invited user about a pending invitation.
// 2. group_memory: notify the other current members after a new group memory is saved.
//
// Required Edge Function secrets:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Optional:
//   EXPO_ACCESS_TOKEN (only if your Expo push setup requires an access token)
//
// Deploy with:
//   supabase functions deploy send-group-notification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EventName = "group_invitation" | "group_memory";

type RequestBody = {
  event?: EventName;
  groupId?: string;
  invitedUserId?: string;
  groupTitle?: string;
};

type ExpoMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: {
    groupId: string;
    groupTitle: string;
    event: EventName;
  };
  channelId: "default";
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase Edge Function environment variables.");
      return jsonResponse(500, { error: "Server configuration is incomplete." });
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Authentication is required." });
    }

    const jwt = authorization.slice("Bearer ".length).trim();
    if (!jwt) {
      return jsonResponse(401, { error: "Authentication is required." });
    }

    // Validate the caller with Supabase Auth before using the service role.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const callerId = authData.user?.id;

    if (authError || !callerId) {
      return jsonResponse(401, { error: "Your session is invalid or expired." });
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Request body must be valid JSON." });
    }

    const event = body.event;
    const groupId = body.groupId;

    if (
      (event !== "group_invitation" && event !== "group_memory") ||
      !isNonEmptyString(groupId)
    ) {
      return jsonResponse(400, { error: "A valid event and groupId are required." });
    }

    let groupTitle = "Group journal";
    const { data: group, error: groupError } = await admin
      .from("group_journals")
      .select("id, title")
      .eq("id", groupId)
      .maybeSingle();

    if (groupError) {
      console.error("Could not load group journal:", groupError.message);
      return jsonResponse(500, { error: "Could not verify the group journal." });
    }

    if (!group) {
      return jsonResponse(404, { error: "Group journal not found." });
    }

    groupTitle = isNonEmptyString(group.title) ? group.title : "Group journal";

    let recipientIds: string[] = [];
    let notificationTitle = "";
    let notificationBody = "";

    if (event === "group_invitation") {
      const invitedUserId = body.invitedUserId;

      if (!isNonEmptyString(invitedUserId)) {
        return jsonResponse(400, { error: "invitedUserId is required." });
      }

      // Only the user who created this pending invitation may trigger its push.
      const { data: invitation, error: invitationError } = await admin
        .from("group_journal_invitations")
        .select("id, group_id, invited_user_id, invited_by, status")
        .eq("group_id", groupId)
        .eq("invited_user_id", invitedUserId)
        .eq("invited_by", callerId)
        .eq("status", "pending")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invitationError) {
        console.error("Could not verify invitation:", invitationError.message);
        return jsonResponse(500, { error: "Could not verify the invitation." });
      }

      if (!invitation) {
        return jsonResponse(403, {
          error: "No matching pending invitation was found for this user.",
        });
      }

      recipientIds = [invitedUserId];
      notificationTitle = "New group journal invitation";
      notificationBody = `You have been invited to join "${groupTitle}".`;
    } else {
      // The caller must currently belong to this group before notifying members.
      const { data: callerMembership, error: callerMembershipError } = await admin
        .from("group_journal_members")
        .select("group_id, user_id")
        .eq("group_id", groupId)
        .eq("user_id", callerId)
        .maybeSingle();

      if (callerMembershipError) {
        console.error(
          "Could not verify group membership:",
          callerMembershipError.message,
        );
        return jsonResponse(500, { error: "Could not verify group membership." });
      }

      if (!callerMembership) {
        return jsonResponse(403, {
          error: "Only current group members can notify this journal.",
        });
      }

      const { data: memberships, error: membersError } = await admin
        .from("group_journal_members")
        .select("user_id")
        .eq("group_id", groupId);

      if (membersError) {
        console.error("Could not load group members:", membersError.message);
        return jsonResponse(500, { error: "Could not load group members." });
      }

      recipientIds = (memberships || [])
        .map((row: { user_id: string }) => row.user_id)
        .filter((userId: string) => userId !== callerId);

      notificationTitle = "New memory in your group journal";
      notificationBody = `A new memory was added to "${groupTitle}".`;
    }

    recipientIds = [...new Set(recipientIds)];

    if (recipientIds.length === 0) {
      return jsonResponse(200, {
        success: true,
        sent: 0,
        message: "There are no other group members to notify.",
      });
    }

    const { data: tokenRows, error: tokenError } = await admin
      .from("user_push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", recipientIds);

    if (tokenError) {
      console.error("Could not load push tokens:", tokenError.message);
      return jsonResponse(500, { error: "Could not load notification recipients." });
    }

    const validTokens: string[] = (tokenRows || [])
      .map((row: { expo_push_token: string | null }) => row.expo_push_token)
      .filter((token: string | null): token is string =>
        typeof token === "string" &&
        (token.startsWith("ExponentPushToken[") ||
          token.startsWith("ExpoPushToken[")),
      );

    const uniqueTokens: string[] = Array.from(new Set<string>(validTokens));

    if (uniqueTokens.length === 0) {
      return jsonResponse(200, {
        success: true,
        sent: 0,
        message: "No registered push tokens were found for the recipients.",
      });
    }

    const messages: ExpoMessage[] = uniqueTokens.map((token: string) => ({
      to: token,
      sound: "default",
      title: notificationTitle,
      body: notificationBody,
      data: { groupId, groupTitle, event },
      channelId: "default",
    }));

    // Expo accepts batches of up to 100 messages per request.
    let accepted = 0;
    const expoErrors: string[] = [];

    for (let index = 0; index < messages.length; index += 100) {
      const batch = messages.slice(index, index + 100);
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      };

      if (expoAccessToken) {
        headers.Authorization = `Bearer ${expoAccessToken}`;
      }

      const expoResponse = await fetch(
        "https://exp.host/--/api/v2/push/send",
        {
          method: "POST",
          headers,
          body: JSON.stringify(batch),
        },
      );

      const expoResult = await expoResponse.json().catch(() => null);

      if (!expoResponse.ok) {
        console.error("Expo push request failed:", expoResponse.status, expoResult);
        expoErrors.push(`Expo returned HTTP ${expoResponse.status}.`);
        continue;
      }

      const tickets = Array.isArray(expoResult?.data)
        ? expoResult.data
        : expoResult?.data
          ? [expoResult.data]
          : [];

      tickets.forEach((ticket: { status?: string; message?: string }) => {
        if (ticket.status === "ok") {
          accepted += 1;
        } else if (ticket.message) {
          expoErrors.push(ticket.message);
        }
      });
    }

    if (expoErrors.length > 0) {
      console.warn("Some Expo push messages were not accepted:", expoErrors);
    }

    return jsonResponse(200, {
      success: true,
      sent: accepted,
      attempted: uniqueTokens.length,
      message:
        accepted > 0
          ? "Push notifications were submitted to Expo."
          : "No push notifications were accepted by Expo.",
    });
  } catch (error) {
    console.error("Unexpected send-group-notification error:", error);
    return jsonResponse(500, { error: "An unexpected notification error occurred." });
  }
});
