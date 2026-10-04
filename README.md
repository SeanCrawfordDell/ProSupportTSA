# EscalationQuality

Static support-workflow site published with GitHub Pages at
https://seancrawforddell.github.io/EscalationQuality/

## Layout

| Path | Contents |
| --- | --- |
| `*.html` | The pages. They stay at the root so published URLs and page-to-page links keep working. |
| `css/` | Stylesheets. |
| `js/` | Page scripts and the shared `*-core.js` modules (also loaded by the tests). |
| `vendor/` | Third-party libraries (marked, DOMPurify) and their licenses. |
| `companion/` | Windows helper for the optional Devin CLI integration. |
| `scripts/` | Developer scripts: `nocache_server.py` (local no-cache server) and the companion packaging script. |
| `tests/` | Node regression tests (`node --test tests/*.test.cjs`). |
| `docs/` | `DEV-NOTES.md`, `CASE_NOTES_GUIDE.md`, preview images and design notes. |
| `downloads/` | Legacy companion ZIP. |

## Develop

```bash
python3 -m http.server 4187 --bind 127.0.0.1
```

Open http://127.0.0.1:4187/index.html, then run `node --test tests/*.test.cjs`.
See `docs/DEV-NOTES.md` for details.
