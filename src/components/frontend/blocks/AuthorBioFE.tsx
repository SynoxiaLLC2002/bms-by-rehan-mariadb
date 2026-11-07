// Renders an Author Bio block against live account data. Used both by the
// published author page and, with a stand-in author, by the editor canvas.

import { resolveAuthorBio, type ResolvedAuthorBio } from "@/lib/authorBio";
import { authorLinks, type AuthorLike } from "@/components/frontend/AuthorProfile";
import type { PropRec } from "@/lib/blockStyle";
import BlockStyle from "@/components/shared/BlockStyle";
import ContentImage from "@/components/frontend/ContentImage";

const RADIUS: Record<string, string> = { circle: "999px", rounded: "1rem", square: "0" };

export default function AuthorBioFE({
  props,
  author,
  scopeBase,
}: {
  props: PropRec;
  author: AuthorLike;
  scopeBase: string;
}) {
  const bio: ResolvedAuthorBio = resolveAuthorBio(props, scopeBase);
  const NameTag = bio.nameTag as "h1" | "h2" | "h3";
  const list = authorLinks(author);

  return (
    <div className={bio.wrapClass} id={bio.anchor}>
      <BlockStyle css={bio.css} />
      {bio.show.has("avatar") && author.image && (
        // Optimised at the avatar's set size (96px unless changed).
        <ContentImage
          src={author.image}
          alt={author.name ?? ""}
          width={192}
          height={192}
          sizes={`${parseInt(String(props.avatarSize ?? ""), 10) > 0 ? parseInt(String(props.avatarSize), 10) : 96}px`}
          className="bmsauth-avatar"
          style={{ borderRadius: RADIUS[bio.avatarShape], objectFit: "cover", display: "inline-block" }}
        />
      )}
      {bio.show.has("name") && author.name && <NameTag className="bmsauth-name">{author.name}</NameTag>}
      {bio.show.has("bio") && author.bio && <p className="bmsauth-bio">{author.bio}</p>}
      {bio.show.has("social") && list.length > 0 && (
        <div
          className="bmsauth-social"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: bio.align === "center" ? "center" : "flex-start", marginTop: "0.75rem" }}
        >
          {list.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="me nofollow noreferrer"
              title={label}
              aria-label={label}
              style={{ borderRadius: "999px", border: "1px solid rgba(0,0,0,.1)", padding: "0.5rem", opacity: 0.7 }}
            >
              <Icon size={15} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
