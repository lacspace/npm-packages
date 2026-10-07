import type { Mailbox, SpecialUse } from "./types.js";

const FLAG_MAP: Record<string, SpecialUse> = {
  "\\inbox": "\\Inbox",
  "\\sent": "\\Sent",
  "\\drafts": "\\Drafts",
  "\\trash": "\\Trash",
  "\\junk": "\\Junk",
  "\\spam": "\\Junk", // XLIST
  "\\archive": "\\Archive",
  "\\all": "\\All",
  "\\allmail": "\\All", // XLIST
  "\\flagged": "\\Flagged",
  "\\starred": "\\Flagged", // XLIST
};

/** Special-use from LIST/XLIST flags (RFC 6154 + Gmail XLIST names), case-insensitive. */
export function specialUseFromFlags(flags: string[]): SpecialUse | undefined {
  for (const f of flags) {
    const s = FLAG_MAP[f.toLowerCase()];
    if (s && s !== "\\Inbox") return s;
  }
  for (const f of flags) if (f.toLowerCase() === "\\inbox") return "\\Inbox";
  return undefined;
}

/** Common English + localised folder names (lowercased) per special use. */
export const SPECIAL_USE_NAMES: Record<Exclude<SpecialUse, "\\Inbox" | "\\All" | "\\Flagged">, string[]> = {
  "\\Sent": [
    "sent", "sent items", "sent mail", "sent messages", "sent-mail", "outbox sent", "gesendet", "gesendete elemente",
    "gesendete objekte", "envoyés", "envoyes", "éléments envoyés", "messages envoyés", "enviados", "elementos enviados",
    "itens enviados", "mensagens enviadas", "inviati", "posta inviata", "elementi inviati", "verzonden", "verzonden items",
    "skickat", "skickade objekt", "sendt", "sendte elementer", "lähetetyt", "wysłane", "elementy wysłane", "odeslané",
    "отправленные", "надіслані", "gönderilmiş öğeler", "gönderilenler", "已发送", "已傳送", "寄件備份", "送信済み", "送信済みアイテム",
    "보낸편지함", "बाहर गएका", "पठाइएको",
  ],
  "\\Trash": [
    "trash", "deleted items", "deleted messages", "deleted", "bin", "papierkorb", "gelöschte elemente", "gelöschte objekte",
    "corbeille", "éléments supprimés", "papelera", "elementos eliminados", "lixeira", "lixo", "itens excluídos", "cestino",
    "elementi eliminati", "prullenbak", "verwijderde items", "papperskorgen", "borttagna objekt", "papirkurv", "slettede elementer",
    "roskakori", "kosz", "elementy usunięte", "koš", "корзина", "удаленные", "удалённые", "кошик", "çöp kutusu", "silinmiş öğeler",
    "已删除", "已刪除", "垃圾桶", "ゴミ箱", "削除済みアイテム", "휴지통",
  ],
  "\\Junk": [
    "junk", "spam", "junk e-mail", "junk email", "junk mail", "bulk mail", "junk-e-mail", "spamverdacht", "courrier indésirable",
    "indésirables", "pourriel", "correo no deseado", "spam correo", "lixo eletrônico", "posta indesiderata", "ongewenste e-mail",
    "skräppost", "uønsket e-post", "roskaposti", "wiadomości-śmieci", "nevyžádaná pošta", "спам", "нежелательная почта",
    "önemsiz e-posta", "垃圾邮件", "垃圾郵件", "迷惑メール", "스팸편지함",
  ],
  "\\Drafts": [
    "drafts", "draft", "entwürfe", "brouillons", "borradores", "rascunhos", "bozze", "concepten", "utkast", "kladder", "luonnokset",
    "kopie robocze", "koncepty", "черновики", "чернетки", "taslaklar", "草稿", "草稿箱", "下書き", "임시보관함",
  ],
  "\\Archive": ["archive", "archives", "archiv", "archivo", "archivio", "archief", "arkiv", "arkisto", "archiwum", "архив", "arquivo", "arşiv", "归档", "封存", "アーカイブ", "보관함"],
};

/** Name-based guess for servers with neither SPECIAL-USE nor XLIST; one mailbox per role, shallowest wins. */
export function guessSpecialUse(boxes: Mailbox[]): void {
  const taken = new Set<SpecialUse>(boxes.map((b) => b.specialUse).filter((s): s is SpecialUse => !!s));
  const candidates = boxes
    .filter((b) => !b.specialUse && !b.flags.some((f) => /^\\(noselect|nonexistent)$/i.test(f)))
    .map((b) => {
      // depth: top-level or directly under INBOX (Courier/Cyrus "INBOX.Sent") count as depth 0
      const parts = b.delimiter ? b.path.split(b.delimiter) : [b.path];
      const underInbox = parts.length === 2 && parts[0]!.toUpperCase() === "INBOX";
      return { b, depth: underInbox ? 0 : parts.length - 1 };
    })
    .filter((c) => c.depth === 0)
    .sort((a, z) => a.depth - z.depth);
  for (const [use, names] of Object.entries(SPECIAL_USE_NAMES) as [SpecialUse, string[]][]) {
    if (taken.has(use)) continue;
    // prefer the earliest name in the list (most canonical), then shallowest
    let best: { b: Mailbox; rank: number } | null = null;
    for (const c of candidates) {
      if (c.b.specialUse) continue;
      const rank = names.indexOf(c.b.name.toLowerCase());
      if (rank === -1) continue;
      if (!best || rank < best.rank) best = { b: c.b, rank };
    }
    if (best) {
      best.b.specialUse = use;
      taken.add(use);
    }
  }
}
