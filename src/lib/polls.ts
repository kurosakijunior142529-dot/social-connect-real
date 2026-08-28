import { supabase } from "@/integrations/supabase/client";

export type PollOption = { text: string };

export type Poll = {
  id: string;
  author_id: string;
  question: string;
  options: PollOption[];
  closes_at: string;
  created_at: string;
};

export type PollDraft = {
  question: string;
  options: string[];
  /** Dias até o encerramento: 1, 3 ou 7. */
  days: number;
};

export const POLL_DURATIONS = [
  { days: 1, label: "1 dia" },
  { days: 3, label: "3 dias" },
  { days: 7, label: "7 dias" },
];

export function validateDraft(draft: PollDraft): string | null {
  const q = draft.question.trim();
  const opts = draft.options.map((o) => o.trim()).filter(Boolean);
  if (q.length < 2) return "Escreva a pergunta da enquete";
  if (q.length > 200) return "Pergunta muito longa";
  if (opts.length < 2) return "Adicione pelo menos 2 opções";
  if (opts.length > 6) return "Máximo de 6 opções";
  if (opts.some((o) => o.length > 60)) return "Opção muito longa (máx. 60)";
  return null;
}

/** Cria a enquete e devolve o id para anexar a um post, comentário ou mensagem. */
export async function createPoll(draft: PollDraft, authorId: string): Promise<string> {
  const err = validateDraft(draft);
  if (err) throw new Error(err);
  const options = draft.options.map((o) => o.trim()).filter(Boolean).map((text) => ({ text }));
  const closes = new Date(Date.now() + draft.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any)
    .from("polls")
    .insert({ author_id: authorId, question: draft.question.trim(), options, closes_at: closes })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchPoll(pollId: string) {
  const [pollRes, countsRes, voteRes] = await Promise.all([
    (supabase as any).from("polls").select("*").eq("id", pollId).maybeSingle(),
    (supabase as any).rpc("poll_counts", { _poll_id: pollId }),
    (supabase as any).from("poll_votes").select("option_index").eq("poll_id", pollId).maybeSingle(),
  ]);
  if (pollRes.error) throw pollRes.error;
  const poll = pollRes.data as Poll | null;
  if (!poll) throw new Error("Enquete não encontrada");
  const counts = new Map<number, number>();
  for (const row of (countsRes.data ?? []) as { option_index: number; votes: number }[]) {
    counts.set(row.option_index, Number(row.votes));
  }
  return {
    poll: { ...poll, options: (poll.options ?? []) as PollOption[] },
    counts,
    myVote: (voteRes.data?.option_index ?? null) as number | null,
  };
}

export async function votePoll(pollId: string, optionIndex: number, userId: string) {
  const { error } = await (supabase as any)
    .from("poll_votes")
    .insert({ poll_id: pollId, user_id: userId, option_index: optionIndex });
  if (error) throw error;
}

export function pollTimeLeft(closesAt: string) {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return { closed: true, label: "Encerrada" };
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return { closed: false, label: `${Math.floor(h / 24)}d restantes` };
  if (h >= 1) return { closed: false, label: `${h}h restantes` };
  return { closed: false, label: `${Math.max(1, Math.floor(ms / 60_000))}min restantes` };
}
