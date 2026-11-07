// The slug here must match plugin.json.
BMS.plugin("my-tool", (root, ctx) => {
  const $ = (sel) => root.querySelector(sel);

  // From the admin's Settings panel (with the manifest's defaults).
  $(".tool").style.setProperty("--accent", ctx.settings.accent || "#0ea5e9");
  // From the shortcode: [my-tool title="Tip calculator"]
  $(".tool-title").textContent = ctx.attrs.title || "My Tool";

  $(".tool-go").addEventListener("click", () => {
    const n = parseFloat($('input[name="n"]').value);
    $(".tool-out").textContent = Number.isFinite(n) ? `Doubled: ${n * 2}` : "Enter a number first.";
  });

  // Optional: return a function to run if the tool is removed from the page.
  return () => {};
});
