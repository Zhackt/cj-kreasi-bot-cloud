// ============================================================
// Bot WhatsApp CJ Kreasi — versi Cloud API resmi (Meta)
// Port dari bot Baileys (index.js v2.2.0): alur order SAMA PERSIS
// (11 paket, tanya nama -> paket -> posisi -> perusahaan -> ringkasan
// -> QRIS -> tunggu bukti). Bedanya: kirim/terima lewat WhatsApp
// Cloud API (graph.facebook.com), bukan socket WA Web.
// Webhook: GET /webhook (verifikasi Meta) + POST /webhook (pesan masuk).
// Env yang wajib: WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN.
// Opsional: PUBLIC_URL (domain publik aplikasi ini, untuk link qris.png),
// PORT (default 3000).
// Catatan: token sementara Meta kedaluwarsa ~24 jam. Untuk pemakaian
// tetap, ganti WHATSAPP_TOKEN dengan token permanen (System User).
// ============================================================
const http = require('http');
const fs = require('fs');

const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'cj-kreasi-verify';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const QRIS_FILE = 'qris.png';
const API_VERSION = 'v21.0';

if (!TOKEN || !PHONE_NUMBER_ID) {
  console.log('[BOT] PERINGATAN: WHATSAPP_TOKEN / PHONE_NUMBER_ID belum diisi — bot tidak bisa kirim pesan.');
}

// ---------- Daftar layanan & harga (sama dengan bot Baileys) ----------
function rp(n) {
  return 'Rp' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
const PAKET = [
  { id: 1, kunci: ['cv saja', 'cv'], nama: 'CV saja', harga: 35000, satuan: '', cv: true },
  { id: 2, kunci: ['cv + surat lamaran', 'cv surat lamaran', 'cv dan surat lamaran', 'surat lamaran'], nama: 'CV + Surat Lamaran', harga: 50000, satuan: '', cv: true },
  { id: 3, kunci: ['paket lengkap', 'lengkap'], nama: 'Paket Lengkap', harga: 75000, satuan: '', cv: true },
  { id: 4, kunci: ['coba', 'paket coba', 'admin coba'], nama: 'Admin Sosmed UMKM — Paket Coba', harga: 49000, satuan: '', cv: false },
  { id: 5, kunci: ['basic', 'admin basic'], nama: 'Admin Sosmed UMKM — Basic', harga: 299000, satuan: '/bln', cv: false },
  { id: 6, kunci: ['naik kelas', 'admin naik kelas'], nama: 'Admin Sosmed UMKM — Naik Kelas', harga: 499000, satuan: '/bln', cv: false },
  { id: 7, kunci: ['poster'], nama: 'Poster', harga: 15000, satuan: '', cv: false },
  { id: 8, kunci: ['brosur 1', 'brosur 1 lembar', 'brosur satu'], nama: 'Brosur 1 lembar', harga: 25000, satuan: '', cv: false },
  { id: 9, kunci: ['brosur 2', 'brosur 2 lembar', 'brosur dua'], nama: 'Brosur 2 lembar', harga: 49000, satuan: '', cv: false },
  { id: 10, kunci: ['katalog'], nama: 'Katalog', harga: 149000, satuan: '', cv: false },
  { id: 11, kunci: ['website', 'web'], nama: 'Website', harga: 150000, satuan: ' (mulai)', cv: false },
];
const DAFTAR_PAKET =
  'LIHAT HARGA di sini:\n' +
  'CV saja — Rp35.000\n' +
  'CV + Surat Lamaran — Rp50.000\n' +
  'Paket Lengkap (CV + Surat Lamaran) — Rp75.000\n' +
  'Admin Sosmed UMKM — Coba: Rp49.000\n' +
  'Admin Sosmed UMKM — Basic: Rp299.000/bln\n' +
  'Admin Sosmed UMKM — Naik Kelas: Rp499.000/bln\n' +
  'Poster — Rp15.000\n' +
  'Brosur 1 lembar — Rp25.000 / 2 lembar Rp49.000\n' +
  'Katalog — Rp149.000\n' +
  'Website profil/komunitas/usaha — mulai Rp150.000';
const MENU =
  'Halo, ini CJ Kreasi — Jasa CV, Desain & Website. Semua Beres di Satu Tempat.\n\n' +
  DAFTAR_PAKET +
  '\n\nSilakan pilih salah satu layanan di atas dengan menulis nomornya (1–11) atau nama paketnya.\n' +
  'Ketik *menu* kapan saja untuk kembali ke daftar ini, atau *batal* untuk membatalkan pesanan.';
function infoBayar(adaQris) {
  let teks = 'Cara bayar (pilih salah satu):\n';
  if (adaQris) teks += '- QRIS: scan gambar QR di atas\n';
  teks +=
    '- DANA: 082259904930\n' +
    '- GoPay: 082259904930\n' +
    '- SeaBank: 901341874303 a.n. MARSELIN\n' +
    '\nSetelah transfer, mohon kirim bukti bayar di chat ini. Terima kasih!';
  return teks;
}
function cariPaket(teks) {
  const t = (teks || '').trim().toLowerCase();
  const nomor = parseInt(t, 10);
  if (!isNaN(nomor) && nomor >= 1 && nomor <= 11) return PAKET[nomor - 1];
  let hasil = null, panjang = 0;
  for (const p of PAKET) {
    for (const k of p.kunci) {
      if (k.length > panjang && (t === k || t.includes(k))) { hasil = p; panjang = k.length; }
    }
  }
  return hasil;
}

// ---------- Kirim pesan via Cloud API ----------
async function apiKirim(payload) {
  const url = 'https://graph.facebook.com/' + API_VERSION + '/' + PHONE_NUMBER_ID + '/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.log('[BOT] Gagal kirim:', res.status, JSON.stringify(data).slice(0, 300));
  return { ok: res.ok, data };
}
async function kirimTeks(ke, teks) {
  try {
    await apiKirim({ messaging_product: 'whatsapp', recipient_type: 'individual', to: ke, type: 'text', text: { body: teks, preview_url: false } });
  } catch (e) { console.log('[BOT] Gagal kirim ke ' + ke + ': ' + e.message); }
}
async function kirimGambar(ke, link, caption) {
  try {
    return await apiKirim({ messaging_product: 'whatsapp', recipient_type: 'individual', to: ke, type: 'image', image: { link, caption } });
  } catch (e) { console.log('[BOT] Gagal kirim gambar ke ' + ke + ': ' + e.message); return { ok: false }; }
}

// ---------- Sesi order per pelanggan ----------
const sesi = new Map();
const sudahDiproses = new Set(); // dedupe: Meta bisa kirim ulang webhook yang sama
const status = { pesanDiproses: 0, statusTerakhir: '-' };
function sesiBaru(nomor) {
  const s = { tahap: 'tanya_nama', nama: null, paket: null, posisi: null, perusahaan: null };
  sesi.set(nomor, s);
  return s;
}
async function keRingkasan(nomor, s) {
  let ring = 'RINGKASAN ORDER CJ KREASI\n\nNama: ' + s.nama + '\nPaket: ' + s.paket.nama + s.paket.satuan + '\nHarga: ' + rp(s.paket.harga) + '\n';
  if (s.paket.cv) ring += 'Posisi yang dilamar: ' + s.posisi + '\nPerusahaan tujuan: ' + s.perusahaan + '\n';
  ring += 'Total yang dibayar: ' + rp(s.paket.harga);
  await kirimTeks(nomor, ring);
  let adaQris = false;
  if (PUBLIC_URL && fs.existsSync(QRIS_FILE)) {
    const r = await kirimGambar(nomor, PUBLIC_URL + '/qris.png', 'QRIS CJ Kreasi\na.n. MARSELIN, LOJI\nNMID: ID1026638841084');
    adaQris = !!r.ok;
  }
  await kirimTeks(nomor, infoBayar(adaQris));
  s.tahap = 'tunggu_bukti';
}
async function prosesPesan(nomor, teks, adaGambar) {
  status.pesanDiproses++;
  const t = (teks || '').trim();
  const tl = t.toLowerCase();
  let s = sesi.get(nomor);
  if (tl === 'batal' || tl === 'cancel') {
    sesi.delete(nomor);
    await kirimTeks(nomor, 'Pesanan dibatalkan. Ketik *menu* untuk melihat layanan CJ Kreasi lagi.');
    return;
  }
  if (tl === 'menu' || tl === 'harga' || tl === 'layanan') {
    sesi.set(nomor, sesiBaru(nomor));
    await kirimTeks(nomor, MENU);
    return;
  }
  if (!s) {
    sesi.set(nomor, sesiBaru(nomor));
    await kirimTeks(nomor, MENU);
    return;
  }
  switch (s.tahap) {
    case 'tanya_nama':
      if (t.length < 2) { await kirimTeks(nomor, 'Mohon tulis nama lengkap Anda.'); return; }
      s.nama = t;
      s.tahap = 'tanya_paket';
      await kirimTeks(nomor, 'Terima kasih, ' + s.nama + '. Silakan pilih paketnya dengan menulis nomor (1–11) atau nama paket.\n\n' + DAFTAR_PAKET);
      return;
    case 'tanya_paket': {
      const p = cariPaket(t);
      if (!p) { await kirimTeks(nomor, 'Maaf, saya tidak menemukan paket itu. Pilih dari daftar ini dengan nomor (1–11) atau nama paket.\n\n' + DAFTAR_PAKET); return; }
      s.paket = p;
      if (p.cv) {
        s.tahap = 'tanya_posisi';
        await kirimTeks(nomor, 'Bagus, Anda memilih *' + p.nama + '* (' + rp(p.harga) + '). Untuk posisi apa Anda melamar?');
      } else {
        await keRingkasan(nomor, s);
      }
      return;
    }
    case 'tanya_posisi':
      if (t.length < 2) { await kirimTeks(nomor, 'Mohon tulis posisi yang dilamar, contoh: Staff Administrasi.'); return; }
      s.posisi = t;
      s.tahap = 'tanya_perusahaan';
      await kirimTeks(nomor, 'Perusahaan mana yang menjadi tujuan lamaran Anda?');
      return;
    case 'tanya_perusahaan':
      if (t.length < 2) { await kirimTeks(nomor, 'Mohon tulis nama perusahaan tujuan.'); return; }
      s.perusahaan = t;
      await keRingkasan(nomor, s);
      return;
    case 'tunggu_bukti':
      await kirimTeks(nomor, 'Terima kasih! Bukti bayar Anda sudah kami terima. Order atas nama *' + s.nama + '* (' + s.paket.nama + ', ' + rp(s.paket.harga) + ') akan segera kami kerjakan. Hasilnya akan dikirim lewat WA ini. Revisi 2x gratis. Terima kasih sudah order di CJ Kreasi!');
      sesi.delete(nomor);
      return;
    default:
      sesi.set(nomor, sesiBaru(nomor));
      await kirimTeks(nomor, MENU);
      return;
  }
}

// ---------- HTTP server: webhook + status + health + qris ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname === '/qris.png') {
    if (fs.existsSync(QRIS_FILE)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(QRIS_FILE).pipe(res);
    } else {
      res.writeHead(404);
      res.end('not found');
    }
    return;
  }
  if (url.pathname === '/webhook' && req.method === 'GET') {
    // Verifikasi webhook oleh Meta.
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN) {
      console.log('[BOT] Webhook terverifikasi oleh Meta.');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(url.searchParams.get('hub.challenge') || '');
    } else {
      res.writeHead(403);
      res.end('verify token tidak cocok');
    }
    return;
  }
  if (url.pathname === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok'); // Balas cepat ke Meta, proses pesannya setelah itu.
      try {
        const data = JSON.parse(body);
        for (const entry of data.entry || []) {
          for (const change of entry.changes || []) {
            const value = change.value || {};
            for (const msg of value.messages || []) {
              if (sudahDiproses.has(msg.id)) continue;
              sudahDiproses.add(msg.id);
              if (sudahDiproses.size > 500) { const pertama = sudahDiproses.values().next().value; sudahDiproses.delete(pertama); }
              const dari = msg.from;
              const teks = msg.type === 'text' ? (msg.text && msg.text.body ? msg.text.body : '') : '';
              const adaGambar = msg.type === 'image' || msg.type === 'document' || msg.type === 'video';
              if (teks || adaGambar) {
                console.log('[BOT] Pesan dari ' + dari + ' (' + msg.type + ')');
                await prosesPesan(dari, teks, adaGambar);
              }
            }
            // Status pengiriman (sent/delivered/read/failed) dari Meta — penting buat diagnosis.
            for (const st of value.statuses || []) {
              const err = st.errors ? ' | error: ' + JSON.stringify(st.errors).slice(0, 300) : '';
              console.log('[BOT] Status ' + st.id + ': ' + st.status + err);
              status.statusTerakhir = st.id + ' → ' + st.status;
            }
          }
        }
      } catch (e) { console.log('[BOT] Gagal proses webhook:', e.message); }
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>CJ Kreasi Bot (Cloud API)</title></head>' +
    '<body style="font-family:system-ui,sans-serif;padding:24px">' +
    '<h1>CJ Kreasi Bot — Cloud API</h1>' +
    '<p>Bot WhatsApp CJ Kreasi (jalur resmi Meta Cloud API).</p>' +
    '<p>Phone Number ID terpasang: <b>' + (PHONE_NUMBER_ID ? 'ya' : 'BELUM — isi env PHONE_NUMBER_ID') + '</b></p>' +
    '<p>Token terpasang: <b>' + (TOKEN ? 'ya' : 'BELUM — isi env WHATSAPP_TOKEN') + '</b></p>' +
    '<p>Webhook: <b>/webhook</b> (daftarkan URL ini di Meta: WhatsApp → Configuration)</p>' +
    '<p>Pesan diproses: ' + status.pesanDiproses + '</p>' +
    '<p>Status kirim terakhir: ' + status.statusTerakhir + '</p>' +
    '</body></html>'
  );
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('[HTTP] Bot Cloud API CJ Kreasi jalan di port ' + PORT));
