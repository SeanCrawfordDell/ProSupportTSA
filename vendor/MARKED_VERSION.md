# marked vendor provenance

`marked.umd.js` is marked 15.0.12 (see its license header), from the official npm package:
https://registry.npmjs.org/marked/-/marked-15.0.12.tgz

SHA-256 of the vendored `vendor/marked.umd.js`:

`d7931d1cd7bf727dd756c871637edcc9e0f8538003b927368400ec1ee47a9dd9`

All marked output is passed through DOMPurify (`js/case-markdown.js`) before it reaches the page. Known marked ReDoS advisories were fixed in 4.0.10. When upgrading, update this file and re-run the Node suite and the hostile-paste check described in `DOMPURIFY_VERSION.md`.
