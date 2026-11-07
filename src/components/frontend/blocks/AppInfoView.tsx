// The rendered App Info block: facts box, download button, structured data.
//
// Server-rendered. The same resolver feeds the box and the JSON-LD, which is
// the whole point — see lib/appInfo.ts.

import { appInfoSchema, resolveAppInfo } from "@/lib/appInfo";
import { jsonLd } from "@/lib/seo";
import ContentImage from "@/components/frontend/ContentImage";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { absoluteUrl } from "@/lib/seoMeta";

function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="bmsapp-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? "on" : i === full && half ? "half" : ""}>★</span>
      ))}
    </span>
  );
}

export default async function AppInfoView({
  props,
  inert = false,
  schemaId,
}: {
  props: Record<string, unknown>;
  /** Editor preview: no structured data, no live link. */
  inert?: boolean;
  /** The node's `@id` on this page — `blockSchemaId(pageUrl, "app", block.id)`. */
  schemaId?: string;
}) {
  const app = resolveAppInfo(props);
  if (!app.name && !app.downloadUrl && app.specs.length === 0) {
    return inert ? <p className="bmsapp-empty">App Info — fill in the app&rsquo;s details in the panel.</p> : null;
  }

  let schema: Record<string, unknown> | null = null;
  if (!inert) {
    const base = siteUrl(await getSiteSettings());
    const absolute = (u: string) => absoluteUrl(u, base);
    schema = appInfoSchema(app, "", absolute, schemaId);
  }

  const button = app.downloadUrl ? (
    <a
      className="bmsapp-btn"
      href={inert ? undefined : app.downloadUrl}
      rel={/^https?:\/\//i.test(app.downloadUrl) ? "nofollow noopener" : undefined}
      target={/^https?:\/\//i.test(app.downloadUrl) ? "_blank" : undefined}
    >
      <span aria-hidden="true">⤓</span> {app.buttonText}
      {app.size && <small>{app.size}</small>}
    </a>
  ) : null;

  return (
    <div className={`bmsapp bmsapp-${app.layout}`}>
      <div className="bmsapp-head">
        {app.icon && (
          // Shown at 72px; optimised to that (and 2x) rather than the original.
          <ContentImage className="bmsapp-icon" src={app.icon} alt="" width={144} height={144} sizes="72px" />
        )}
        <div className="bmsapp-title">
          {app.name && <p className="bmsapp-name">{app.name}</p>}
          {app.developer && <p className="bmsapp-dev">{app.developer}</p>}
          {app.rating && (
            <p className="bmsapp-rating">
              <Stars value={app.rating.value} />
              <span>
                {app.rating.value.toFixed(1)} · {app.rating.count.toLocaleString()} ratings
              </span>
            </p>
          )}
        </div>
        {app.layout === "card" && button}
      </div>

      {app.specs.length > 0 && (
        <dl className="bmsapp-specs">
          {app.specs.map(([k, v]) => (
            <div key={k} className="bmsapp-spec">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {app.layout === "table" && button && <div className="bmsapp-foot">{button}</div>}

      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />}
    </div>
  );
}
