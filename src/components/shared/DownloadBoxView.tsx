// The Download Box markup, shared by the editor preview and the live page.
//
// No hooks and no server-only imports, so it renders in both places. The only
// interactive part — the countdown — is its own client component, used only
// when the box has one and only on the live page.

import type { CSSProperties, ReactNode } from "react";
import type { ResolvedDlb } from "@/lib/downloadBox";
import { downloadBoxClass, downloadBoxVars } from "@/lib/downloadBox";
import DownloadBoxActions from "@/components/shared/DownloadBoxActions";

function initials(title: string): string {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "⬇";
}

export default function DownloadBoxView({ box, inert = false }: { box: ResolvedDlb; inert?: boolean }) {
  const r = box;
  const vars = downloadBoxVars(r) as unknown as CSSProperties;

  const icon = (
    <div className="dlb-icon">
      {r.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.icon} alt="" loading="lazy" decoding="async" width={96} height={96} />
      ) : (
        <span>{r.layout === "file" ? "⬇" : initials(r.title)}</span>
      )}
      {r.layout === "file" && r.fileType && <span className="dlb-type">{r.fileType}</span>}
    </div>
  );

  const heading = (
    <>
      <h3 className="dlb-title">
        {r.title}
        {r.badge && <span className="dlb-badge">{r.badge}</span>}
      </h3>
      {r.subtitle && <p className="dlb-sub">{r.subtitle}</p>}
    </>
  );

  const metaList =
    r.meta.length > 0 && r.layout !== "table" ? (
      <ul className="dlb-meta">
        {r.meta.map((m) => (
          <li key={m.label}>
            {r.showLabels && <b>{m.label}</b>}
            {r.showLabels && r.style.metaStyle !== "grid" ? " " : ""}
            {m.value}
          </li>
        ))}
      </ul>
    ) : null;

  const features =
    r.features.length > 0 ? (
      <ul className="dlb-features">
        {r.features.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    ) : null;

  const actions: ReactNode = <DownloadBoxActions box={r} inert={inert} />;

  const note = r.note ? <p className="dlb-note">{r.note}</p> : null;
  const sizeItem = r.meta.find((m) => m.label === "Size");

  let body: ReactNode;
  switch (r.layout) {
    case "hero":
      body = (
        <div className="dlb-main">
          {icon}
          <div className="dlb-body">
            {heading}
            {metaList}
            {features}
          </div>
          <div className="dlb-actions">{actions}</div>
          {note}
        </div>
      );
      break;
    case "split":
      body = (
        <>
          <div className="dlb-main">
            {icon}
            <div className="dlb-body">
              {heading}
              {metaList}
              {features}
              {note}
            </div>
          </div>
          <div className="dlb-side">
            {sizeItem && (
              <div>
                <div className="dlb-side-size">{sizeItem.value}</div>
                <div className="dlb-side-label">{r.fileType || "File"} size</div>
              </div>
            )}
            {actions}
          </div>
        </>
      );
      break;
    case "table":
      body = (
        <>
          <div className="dlb-main">
            {icon}
            <div className="dlb-body">{heading}</div>
          </div>
          {r.meta.length > 0 && (
            <table className="dlb-table">
              <tbody>
                {r.meta.map((m) => (
                  <tr key={m.label}>
                    <th scope="row">{m.label}</th>
                    <td>{m.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {features}
          <div className="dlb-actions" style={{ marginTop: features ? "1rem" : undefined }}>{actions}</div>
          {note}
        </>
      );
      break;
    default:
      // card, compact, file
      body = (
        <>
          <div className="dlb-main">
            {icon}
            <div className="dlb-body">
              {heading}
              {metaList}
              {r.layout !== "compact" && features}
            </div>
            <div className="dlb-actions">{actions}</div>
          </div>
          {note}
        </>
      );
  }

  return (
    <div className={downloadBoxClass(r)} style={vars} data-preset={r.preset.id}>
      {body}
    </div>
  );
}
