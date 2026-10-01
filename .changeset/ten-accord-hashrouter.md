---
"@useaccord/landing": minor
---

refactor the landing router to react-router HashRouter (the workspace convention for GH Pages): hash routes (#/, #/how-it-rules/:slug, #/blurb), Link-based internal nav, scroll-to-top and per-route document titles, unknown routes fall back home; legacy path URLs bounce to their hash route via 404.html.
