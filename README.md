# Huggingface Model Filters

Browser extension that adds two sections to the filter sidebar on
[huggingface.co/models](https://huggingface.co/models), right below the native
Parameters slider:

**Parameter range** — an exact minimum/maximum parameter count (`500M`, `8B`,
`1.5e9`, or a plain number). The native slider only offers fixed steps. This is
sent to Hugging Face as the same `num_parameters` URL parameter the slider uses,
so sorting, result counts and pagination all stay correct, and the URL can be
bookmarked or shared.

- *Hide unknown size* drops repos that report no parameter count. Without it
  they pass any maximum and tend to fill the first pages.

**Refine this page** — things Hugging Face can't filter by, applied in the
browser to the models on the current page:

- Min downloads / Min likes
- Updated within N days
- Name excludes (comma-separated, matched against `author/name`)
- Hide gated

Because these only hide cards from the page HF returned, a strict setting can
leave a page nearly empty; the section shows how many were hidden. Combining
them with a matching sort (most downloads, most likes, recently updated) keeps
the matches on the first pages. These settings are remembered between visits.

## Install

Firefox, Zen, LibreWolf:

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** and pick `manifest.json`

A temporary add-on is removed when the browser restarts. For a permanent
install, build it with `npm run build` and either sign the zip through
[addons.mozilla.org](https://addons.mozilla.org/developers/) as an unlisted
add-on, or, in a browser that allows it (LibreWolf, Firefox Developer Edition),
set `xpinstall.signatures.required` to `false` in `about:config` and install the
zip from `about:addons`.

Chromium browsers: `chrome://extensions` → enable Developer mode → **Load
unpacked** → pick this folder.

## Development

```sh
npm test        # unit tests for the parsing / URL / matching helpers
npm run lint    # web-ext lint
npm start       # launches Firefox with the extension loaded
npm run build   # zip for addons.mozilla.org, in web-ext-artifacts/
npm run submit  # upload as a listed add-on; needs WEB_EXT_API_KEY and WEB_EXT_API_SECRET
```

`amo-metadata.json` carries the listing summary, category and licence used by
`npm run submit`.

`src/lib.js` holds the pure logic, `src/content.js` the page integration. The
section is built from Hugging Face's own CSS class lists (the `HF` object at the
top of `content.js`), so it follows their styling and dark theme. If they
restyle the page and it starts to look off, those class lists are the place to
update. It needs no permissions beyond running on the models page.

## Licence

[MIT](LICENSE)
