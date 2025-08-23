---
title: LLM Playground (Browser-only)
emoji: 🚀
colorFrom: purple
colorTo: indigo
sdk: static
app_build_command: "npm install && npm run build -- --outfile=./dist/index.js && cp index.html ./dist/index.html"
app_file: "./dist/index.html" # This is where Vite typically outputs its index.html
---

# My Browser-only LLM Playground

This Hugging Face Space hosts a client-side machine learning playground built with HTML, CSS, and JavaScript.
It uses [Vite/esbuild] for the build process.

### How it works:
- The `app_build_command` in `README.md` runs `npm install` and `npm run build`.
- The built static assets are then served from the `dist/` directory, as specified by `app_file`.