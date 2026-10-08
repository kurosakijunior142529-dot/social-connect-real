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
