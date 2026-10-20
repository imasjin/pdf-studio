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

- All PDF processing is client-side: @cantoo/pdf-lib (writing, AES encryption) and pdfjs-dist v4 (rendering; v5+ needs very new browser APIs). Load pdfjs only via dynamic import in src/lib/pdf.ts because it touches browser APIs.
- Tools render through one dynamic route (/tool/$id) driven by src/lib/tools.ts so adding a tool is one registry entry plus a component.
