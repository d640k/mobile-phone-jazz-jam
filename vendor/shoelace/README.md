# Shoelace (vendored)

[Shoelace](https://shoelace.style) 2.20.1, MIT licence (see LICENSE.md), copied here so
the app works offline and needs no build step.

`shoelace.js` bundles only the components listed in `build-entry.js`:

    npm i @shoelace-style/shoelace@2.20.1 esbuild
    npx esbuild build-entry.js --bundle --minify --format=esm --outfile=shoelace.js --legal-comments=eof

`light.css` / `dark.css` are Shoelace's themes; js/ui.js switches `sl-theme-dark` on <html>.
