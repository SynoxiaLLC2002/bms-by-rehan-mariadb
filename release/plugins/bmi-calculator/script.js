// BMI Calculator — a BMS plugin.
//
// `root` is this plugin's own shadow root: query inside it, never the page.
// `ctx` is what the site tells us: settings from the admin, attributes from
// the shortcode, the page's language and direction.

BMS.plugin("bmi-calculator", (root, ctx) => {
  const $ = (sel) => root.querySelector(sel);
  const box = $(".bmi");
  const height = $('input[name="height"]');
  const weight = $('input[name="weight"]');
  const result = $(".bmi-result");

  // Settings chosen in Admin -> Plugins, with the manifest's defaults.
  box.style.setProperty("--accent", ctx.settings.accent || "#0ea5e9");
  $(".bmi-go").textContent = ctx.settings.buttonText || "Calculate";
  if (ctx.settings.showScale === false) $(".bmi-scale").hidden = true;

  // The shortcode may say [bmi-calculator units="imperial"].
  let units = ctx.attrs.units === "imperial" ? "imperial" : "metric";

  function applyUnits() {
    root.querySelectorAll(".bmi-units button").forEach((b) => b.classList.toggle("on", b.dataset.units === units));
    $(".bmi-h-unit").textContent = units === "metric" ? "(cm)" : "(inches)";
    $(".bmi-w-unit").textContent = units === "metric" ? "(kg)" : "(lb)";
  }
  applyUnits();

  root.querySelectorAll(".bmi-units button").forEach((b) =>
    b.addEventListener("click", () => {
      units = b.dataset.units;
      applyUnits();
    })
  );

  function calculate() {
    const h = parseFloat(height.value);
    const w = parseFloat(weight.value);
    if (!(h > 0) || !(w > 0)) {
      result.hidden = true;
      return;
    }
    const bmi = units === "metric" ? w / Math.pow(h / 100, 2) : (703 * w) / Math.pow(h, 2);
    const range = bmi < 18.5 ? "under" : bmi < 25 ? "normal" : bmi < 30 ? "over" : "obese";
    const labels = { under: "Underweight", normal: "Normal weight", over: "Overweight", obese: "Obese" };
    $(".bmi-value").textContent = bmi.toFixed(1);
    $(".bmi-label").textContent = labels[range];
    root.querySelectorAll(".bmi-scale span").forEach((s) => s.classList.toggle("on", s.dataset.range === range));
    result.hidden = false;
  }

  $(".bmi-go").addEventListener("click", calculate);
  [height, weight].forEach((i) => i.addEventListener("keydown", (e) => e.key === "Enter" && calculate()));
});
