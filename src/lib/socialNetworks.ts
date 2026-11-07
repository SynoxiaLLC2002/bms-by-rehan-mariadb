// The social networks the Social Icons and Team Member blocks offer.
//
// Glyphs rather than an icon library: they render identically on the server,
// cost nothing to ship, and keep the editor preview and the published page
// looking the same. Swap in real SVGs here if you ever want branded marks.

export interface SocialNetwork {
  id: string;
  label: string;
  glyph: string;
  /** Brand colour, used by the "filled" style. */
  color: string;
  /** Prefix applied when someone types a bare handle instead of a URL. */
  prefix?: string;
}

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  { id: "x",         label: "X",         glyph: "𝕏", color: "#000000", prefix: "https://x.com/" },
  { id: "facebook",  label: "Facebook",  glyph: "f", color: "#1877f2", prefix: "https://facebook.com/" },
  { id: "instagram", label: "Instagram", glyph: "◙", color: "#e1306c", prefix: "https://instagram.com/" },
  { id: "linkedin",  label: "LinkedIn",  glyph: "in", color: "#0a66c2", prefix: "https://linkedin.com/in/" },
  { id: "youtube",   label: "YouTube",   glyph: "▶", color: "#ff0000", prefix: "https://youtube.com/@" },
  { id: "github",    label: "GitHub",    glyph: "⌥", color: "#181717", prefix: "https://github.com/" },
  { id: "tiktok",    label: "TikTok",    glyph: "♪", color: "#000000", prefix: "https://tiktok.com/@" },
  { id: "pinterest", label: "Pinterest", glyph: "P", color: "#bd081c", prefix: "https://pinterest.com/" },
  { id: "reddit",    label: "Reddit",    glyph: "◕", color: "#ff4500", prefix: "https://reddit.com/user/" },
  { id: "discord",   label: "Discord",   glyph: "◈", color: "#5865f2" },
  { id: "whatsapp",  label: "WhatsApp",  glyph: "✆", color: "#25d366" },
  { id: "telegram",  label: "Telegram",  glyph: "➤", color: "#26a5e4", prefix: "https://t.me/" },
  { id: "email",     label: "Email",     glyph: "✉", color: "#64748b", prefix: "mailto:" },
  { id: "website",   label: "Website",   glyph: "⌘", color: "#0ea5e9" },
  { id: "rss",       label: "RSS",       glyph: "◜", color: "#f26522" },
];

export const SOCIAL_GLYPHS: Record<string, string> = Object.fromEntries(
  SOCIAL_NETWORKS.map((n) => [n.id, n.glyph])
);

export const socialNetwork = (id: string) =>
  SOCIAL_NETWORKS.find((n) => n.id === id) ?? SOCIAL_NETWORKS[SOCIAL_NETWORKS.length - 2];

/** Accepts a full URL or a bare handle and returns something linkable. */
export function socialHref(id: string, value: string): string {
  const v = (value || "").trim();
  if (!v) return "#";
  if (/^(https?:|mailto:|tel:|\/)/i.test(v)) return v;
  const net = socialNetwork(id);
  return net.prefix ? net.prefix + v.replace(/^@/, "") : v;
}
