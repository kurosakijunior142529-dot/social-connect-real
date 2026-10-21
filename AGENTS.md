<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Verification UI is centralized in `verified-badge.tsx`; keep badge meaning, authenticity details, and category visuals sourced from its shared configuration so every surface stays consistent.
- Wallpaper images use existing allowed conversation wallpaper IDs; resolve images centrally in the picker, while dimming stays device-local per conversation to avoid changing the other participant's brightness.
- Keep pull-to-refresh scoped to feed and conversation lists in the app shell; exclude nested scrollers and gesture-owned controls to preserve navigation and message actions.
- Photo loading transitions belong in SignedImage and global semantic CSS, preserving callers' sizing and private-media retries.
- The shared audio recorder owns pointer capture and recording cleanup so locking gestures behave identically in direct and group conversations.
- Bubble reply/like gestures must exclude interactive descendants so media controls do not trigger message actions.
- The shell's private-message unread badge reads `messages` and refreshes on message changes and successful read updates; group/channel read state is separate.
- Sintonias extend the existing user_notes rows; enforce expiry and follower/block visibility in database policies, and store voice as private paths with matching storage read policies.
- The shared AudioRecorder accepts an optional duration limit; keep microphone lifecycle and gesture cleanup centralized for both messages and Sintonias.
- Conversation-list presence uses the shared global presence hook inside Sintonias instead of a separate online rail, keeping the top of the list uncluttered.
