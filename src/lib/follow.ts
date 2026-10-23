import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Segue alguém; se a conta for privada, envia uma solicitação. */
export async function followUser(followerId: string, targetId: string) {
  const { data: isPrivate } = await supabase.rpc("is_private_account", { _owner: targetId });
  if (isPrivate) {
    const { error } = await supabase
      .from("follow_requests")
      .upsert({ requester_id: followerId, target_id: targetId }, { onConflict: "requester_id,target_id", ignoreDuplicates: true });
    if (!error) toast.success("Solicitação enviada");
    return { error, requested: true };
  }
  const { error } = await supabase.from("follows").insert({ follower_id: followerId, following_id: targetId });
  return { error, requested: false };
}
