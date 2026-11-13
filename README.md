# PLC Workspace — Offline-First Notion Clone

Workspace bergaya **Notion** yang ringan, responsif, mendukung mode **Light & Dark**, bekerja penuh secara **offline (PWA + LocalStorage)**, serta mendukung **backend SQLite + Express** untuk self-hosting atau deployment penuh.

## Fitur Utama

1. **4 Tampilan Database Interaktif**
   - **Overview** (`Table`): Tabel lengkap dengan inline editing, filter, sort, search, tambah properti dinamis, dan hitungan baris (`COUNT`).
   - **Status** (`Kanban`): Papan status (*Backlog*, *To Do*, *In Progress*, *In Review*, *Done*) dengan drag-and-drop dan pembuatan kartu per kolom.
   - **Calendar**: Kalender bulanan interaktif untuk menjadwalkan item berdasarkan tanggal dan membuat item langsung di sel tanggal.
   - **Category** (`Kanban`): Papan pengelompokan otomatis berdasarkan kolom *Category* (*Editor*, *Database*, *Offline*, *Infrastructure*, *Security*, dll.) dengan drag-and-drop dan tombol tambah cepat.
2. **Rich Block Editor & Slash Commands (`/`)**
   - Paragraph, H1–H3, To-do list, Bulleted & Numbered list (dengan nested indentation `Tab`/`Shift+Tab`), Toggle, Callout, Quote, Code block, Equation, Table, Divider, Image, Bookmark, dan Embedded Database.
3. **Cloud Database (Firebase Firestore) + Offline-First PWA**
   - **Firebase Firestore** aktif & tersinkron real-time melalui **Google Sign-In** (Project: `ordinal-shape-w5v9p`, Database: `ai-studio-plcworkspace-9eac181d-b756-4396-b3f7-81a5026ec8f7`), sehingga data tetap aman tersimpan di cloud meskipun di-host secara statis di GitHub Pages!
   - Dapat di-install ke Desktop/Mobile sebagai PWA.
   - Otomatis mendeteksi mode **Static Hosting (GitHub Pages)** dengan cache offline di `localStorage`, atau mode **Full-Stack** dengan SQLite (`./data/workspace.db`) + outbox sync.
   - Ekspor & Impor backup penuh dalam format `.json` serta ekspor halaman ke `.md`.

---

## Cara Push ke GitHub & Hosting Gratis

### 1. Push ke Repository GitHub Anda

```bash
git remote add origin https://github.com/<USERNAME>/<NAMA-REPO>.git
git branch -M main
git push -u origin main
```

### 2. Opsi A — Hosting Gratis via GitHub Pages (Static + Offline PWA)

Repository ini sudah dilengkapi workflow otomatis di `.github/workflows/deploy-pages.yml`:

1. Buka repository Anda di GitHub → **Settings** → **Pages**.
2. Pada bagian **Build and deployment → Source**, pilih **GitHub Actions**.
3. Setiap kali Anda `git push` ke branch `main`, GitHub otomatis menjalankan test, build `dist/`, dan menayangkan aplikasi ke `https://<USERNAME>.github.io/<NAMA-REPO>/`.

### 3. Opsi B — Hosting Full-Stack (Node.js + SQLite) dari GitHub

Jika ingin menyimpan data di server SQLite (lintas perangkat + passcode lock):

- **Render**: Hubungkan repository GitHub Anda di Render (`render.yaml` sudah tersedia).
- **Docker / VPS**:
  ```bash
  docker build -t plc-workspace .
  docker run -d -p 3000:3000 -v plc_data:/app/data plc-workspace
  ```

## Pengembangan Lokal

```bash
npm install
npm run dev      # Full-stack dev server (port 3000)
npm run build    # Build produksi ke dist/
npm start        # Jalankan server produksi
```
