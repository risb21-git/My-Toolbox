A# ToolBox – free browser-based PDF, image & text tools

A static website (HTML + CSS + JavaScript). No backend, no database, no cost.
All files are processed **inside the visitor's browser**, so nothing is uploaded.

## Tools included
**Productivity** (saved in the visitor's own browser): to-do list, target chaser (goal + deadline + daily pace), habit tracker with streaks, Pomodoro timer, quick notes, job application tracker (CSV export), expense tracker, EMI calculator, backup & restore
**PDF:** merge, split / extract / delete pages, rotate, compress (scanned PDFs), PDF → images, PDF → text, page numbers, watermark
**Image:** compress / resize / convert (JPG, PNG, WebP), images → PDF
**Text & Dev:** word counter, case converter, JSON formatter, Base64, password generator, QR code, SHA hash

## Run locally
Open `index.html` in a browser, or run `python -m http.server 8000` in this folder and visit http://localhost:8000.
(An internet connection is needed because the libraries load from a CDN.)

## Deploy for free (pick one)
**GitHub Pages**
1. Create a new public repository and upload these 4 files.
2. Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/ (root)`.
3. Your site appears at `https://<username>.github.io/<repo>/`.

**Netlify** – go to app.netlify.com/drop and drag this folder in. Done.

**Cloudflare Pages** – Workers & Pages → Create → Pages → Upload assets → upload the folder.

**Vercel** – import the GitHub repository; framework preset "Other"; no build command.

## Add a new tool
Open `app.js` and copy any `TOOLS.push({...})` block. Give it a new `id`, `group`, `name`, `desc`
and a `render(b)` function that fills the container `b`. It appears in the menu automatically.

## Libraries (all free and open source, loaded from cdnjs)
pdf-lib, pdf.js, JSZip, qrcodejs

## Known limits
- Very large files (hundreds of MB) can exhaust browser memory, especially on phones.
- "Compress PDF" turns pages into images, so text will no longer be selectable.
- Watermark and page numbers support Latin characters only.
- Password-protected PDFs are not supported.
