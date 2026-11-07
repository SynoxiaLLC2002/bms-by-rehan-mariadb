// The public face of an author: the avatar above the name, the links below the
// bio.
//
// Two slots rather than one component, because the two halves sit on either
// side of the biography and `BlogArchive` owns the header between them.

import { Globe, Facebook, Github, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";

export interface AuthorLike {
  name: string | null;
  slug: string | null;
  image?: string | null;
  bio?: string | null;
  website?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  github?: string | null;
  youtube?: string | null;
}

/**
 * A link the page is willing to render, or "".
 *
 * These are administrator-written, but they end up in an `href`, and `href` is
 * where `javascript:` becomes stored XSS on every view of the page. The same
 * guard the comment author URL gets, for the same reason.
 */
export function safeUrl(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** The social links an author has filled in, in a fixed order. */
export function authorLinks(a: AuthorLike) {
  return (
    [
      ["Website", a.website, Globe],
      ["X", a.twitter, Twitter],
      ["LinkedIn", a.linkedin, Linkedin],
      ["GitHub", a.github, Github],
      ["Instagram", a.instagram, Instagram],
      ["Facebook", a.facebook, Facebook],
      ["YouTube", a.youtube, Youtube],
    ] as const
  )
    .map(([label, raw, Icon]) => ({ label, href: safeUrl(raw), Icon }))
    .filter((l) => l.href);
}

export default function AuthorProfile({
  author,
  slot,
}: {
  author: AuthorLike;
  slot: "avatar" | "links";
}) {
  if (slot === "avatar") {
    if (!author.image) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.image}
        alt={author.name ?? ""}
        width={96}
        height={96}
        className="author-avatar mx-auto mb-5 h-24 w-24 rounded-full border border-black/10 object-cover"
      />
    );
  }

  const list = authorLinks(author);
  if (list.length === 0) return null;

  return (
    <div className="author-links mt-5 flex flex-wrap items-center justify-center gap-3">
      {list.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          // `me` states that the profile at the other end is the same person,
          // which is what the relationship actually is. `nofollow` keeps a
          // personal link from passing the site's authority around.
          rel="me nofollow noreferrer"
          title={label}
          aria-label={label}
          className="rounded-full border border-black/10 p-2 opacity-60 transition-opacity hover:opacity-100"
        >
          <Icon size={15} />
        </a>
      ))}
    </div>
  );
}

/**
 * `Person` schema for the author page.
 *
 * `sameAs` is the machine-readable half of the links above: it is how a search
 * engine knows the X account and the GitHub account belong to the same person
 * as this page, rather than being three unrelated profiles.
 */
export function authorSchema(author: AuthorLike, url: string) {
  // The personal website belongs in `sameAs` with the rest, not in `url`.
  //
  // `url` is the person's canonical page, which is *this* one. Spreading the
  // website in afterwards silently overwrote it, so the schema announced the
  // author's own domain as their identity and this page as nothing at all.
  const sameAs = authorLinks(author).map((l) => l.href);

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profilepage`,
    mainEntity: {
      "@type": "Person",
      // The id every Article's `author` already points at (see the post
      // route). Without it here, those references named a node that no page
      // on the site ever emitted.
      "@id": `${url}#person`,
      name: author.name || author.slug || "Author",
      url,
      ...(author.image ? { image: author.image } : {}),
      ...(author.bio ? { description: author.bio } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
  };
}
