#!/usr/bin/env node
//
// Writes src/lib/blockManifest.json: every block the editor can insert, with
// its props and their defaults — what /api/mcp/blocks hands the MCP hub so it
// builds pages with the blocks this site actually has.
//
// The prop schemas live inside the editor's block specs (customBlocks.tsx),
// which is a client component and cannot be imported on the server. Parsing
// the source keeps one definition: a prop added there shows up here on the
// next build, and a renamed one cannot drift.
//
// Runs before `next build` (package.json). Fails loudly if it finds nothing,
// so a refactor that moves the specs cannot ship an empty manifest.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPECS = [
  join(root, "src/components/editor/customBlocks.tsx"),
  join(root, "src/components/editor/RowLayoutBlock.tsx"),
];
const LIBRARY = join(root, "src/lib/blockLibrary.ts");
const OUT = join(root, "src/lib/blockManifest.json");

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function propName(p) {
  const n = p.name;
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return null;
}

/** A literal's value, or undefined for anything computed. */
function literal(node, constants) {
  if (!node) return undefined;
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression?.(node)) node = node.expression;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  if (ts.isArrayLiteralExpression(node)) {
    const out = node.elements.map((e) => literal(e, constants));
    return out.every((v) => v !== undefined) ? out : undefined;
  }
  if (ts.isObjectLiteralExpression(node)) {
    // A key whose value is computed stays, as null: knowing a prop exists is
    // most of what the manifest is for.
    const out = {};
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) {
        const v = literal(p.expression, constants);
        if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, v);
        continue;
      }
      if (ts.isShorthandPropertyAssignment(p)) {
        out[p.name.text] = constants.get(p.name.text) ?? null;
        continue;
      }
      if (!ts.isPropertyAssignment(p)) continue;
      const k = propName(p);
      if (k === null) continue;
      const v = literal(p.initializer, constants);
      out[k] = v === undefined ? null : v;
    }
    return out;
  }
  // `JSON.stringify(<literal>)` — how list-like props store their default.
  if (ts.isCallExpression(node) && node.expression.getText() === "JSON.stringify" && node.arguments.length === 1) {
    const v = literal(node.arguments[0], constants);
    return v === undefined ? undefined : JSON.stringify(v);
  }
  // `X_DEFAULTS.foo` or a bare constant defined in the same file.
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const obj = constants.get(node.expression.text);
    if (obj && typeof obj === "object" && node.name.text in obj) return obj[node.name.text];
  }
  if (ts.isIdentifier(node) && constants.has(node.text)) return constants.get(node.text);
  return undefined;
}

/** `const NAME = <literal>` anywhere in the file. */
function collectConstants(sf, seed = new Map()) {
  const constants = new Map(seed);
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const v = literal(n.initializer, constants);
      if (v !== undefined) constants.set(n.name.text, v);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return constants;
}

/** Where an import specifier points, as a file on disk. */
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext) && !(base + ext).endsWith("/")) {
      try { if (readFileSync(base + ext)) return base + ext; } catch { /* a directory */ }
    }
  }
  return null;
}

const fileConstants = new Map();
/**
 * Constants of a file, plus those it imports by name — so a schema built from
 * `APP_INFO_DEFAULTS` (lib/appInfo.ts) resolves like one written inline.
 */
function constantsOf(file, depth = 0) {
  if (fileConstants.has(file)) return fileConstants.get(file);
  const sf = parse(file);
  const constants = new Map();
  fileConstants.set(file, constants);
  if (depth < 3) {
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
      const target = resolveImport(file, st.moduleSpecifier.text);
      if (!target) continue;
      const theirs = constantsOf(target, depth + 1);
      for (const el of st.importClause.namedBindings.elements) {
        const theirName = (el.propertyName ?? el.name).text;
        if (theirs.has(theirName)) constants.set(el.name.text, theirs.get(theirName));
      }
    }
  }
  for (const [k, v] of collectConstants(sf, constants)) constants.set(k, v);
  return constants;
}

/**
 * `Object.fromEntries(Object.entries(X).map(([k, v]) => [k, { default: v }]))`
 * — the schema-from-defaults idiom. Returns X's value, or undefined.
 */
function fromEntriesOf(node, constants) {
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  if (!ts.isCallExpression(node) || node.expression.getText() !== "Object.fromEntries") return undefined;
  const arg = node.arguments[0];
  if (!arg || !ts.isCallExpression(arg) || !ts.isPropertyAccessExpression(arg.expression) || arg.expression.name.text !== "map") return undefined;
  const inner = arg.expression.expression;
  if (!ts.isCallExpression(inner) || inner.expression.getText() !== "Object.entries") return undefined;
  return literal(inner.arguments[0], constants);
}

function getProp(obj, name) {
  return obj.properties.find((p) => ts.isPropertyAssignment(p) && propName(p) === name);
}

// ── Block specs: objects with `type: "x"` and `propSchema: { … }` ───────────
const specs = {};
function propsFromSchema(node, constants, props) {
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  // A schema named elsewhere: `propSchema: ROW_LAYOUT_PROPS`.
  if (ts.isIdentifier(node)) {
    const v = constants.get(node.text);
    if (v && typeof v === "object") for (const [k, d] of Object.entries(v)) props[k] = d && typeof d === "object" && "default" in d ? d : { default: d };
    return;
  }
  const fromDefaults = fromEntriesOf(node, constants);
  if (fromDefaults && typeof fromDefaults === "object") {
    for (const [k, v] of Object.entries(fromDefaults)) props[k] = { default: v };
    return;
  }
  if (!ts.isObjectLiteralExpression(node)) return;
  for (const p of node.properties) {
    if (ts.isSpreadAssignment(p)) {
      propsFromSchema(p.expression, constants, props);
      continue;
    }
    if (!ts.isPropertyAssignment(p)) continue;
    const key = propName(p);
    if (!key) continue;
    const def = {};
    if (ts.isObjectLiteralExpression(p.initializer)) {
      const d = getProp(p.initializer, "default");
      const vals = getProp(p.initializer, "values");
      const dv = d ? literal(d.initializer, constants) : undefined;
      if (dv !== undefined) def.default = dv;
      else if (d) def.default = null; // computed default
      const vv = vals ? literal(vals.initializer, constants) : undefined;
      if (vv !== undefined) def.values = vv;
    }
    props[key] = def;
  }
}
for (const file of SPECS) {
  const sf = parse(file);
  const constants = constantsOf(file);
  const visit = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const typeP = getProp(n, "type");
      const schemaP = getProp(n, "propSchema");
      const type = typeP && literal(typeP.initializer, constants);
      if (typeof type === "string" && schemaP) {
        const props = {};
        propsFromSchema(schemaP.initializer, constants, props);
        const contentP = getProp(n, "content");
        specs[type] = { props, content: contentP ? literal(contentP.initializer, constants) ?? null : null };
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ── The library: label, hint, category, insert props ───────────────────────
const library = [];
{
  const sf = parse(LIBRARY);
  const constants = constantsOf(LIBRARY);
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "BLOCK_LIBRARY" && n.initializer && ts.isArrayLiteralExpression(n.initializer)) {
      for (const el of n.initializer.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        const get = (k) => {
          const p = getProp(el, k);
          return p ? literal(p.initializer, constants) : undefined;
        };
        library.push({ type: get("type"), label: get("label"), hint: get("hint"), category: get("category"), props: get("props"), keywords: get("keywords") });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (Object.keys(specs).length < 10 || library.length < 10) {
  console.error(`block-manifest: found ${Object.keys(specs).length} specs and ${library.length} library entries — the source layout changed. Fix scripts/block-manifest.mjs.`);
  process.exit(1);
}

// BlockNote's own blocks have no spec in customBlocks.tsx.
const BUILTIN = {
  paragraph: { props: { textColor: { default: "default" }, backgroundColor: { default: "default" }, textAlignment: { default: "left", values: ["left", "center", "right", "justify"] } }, content: "inline" },
  heading: { props: { level: { default: 1, values: [1, 2, 3, 4, 5, 6] }, textColor: { default: "default" }, backgroundColor: { default: "default" }, textAlignment: { default: "left" } }, content: "inline" },
  bulletListItem: { props: { textColor: { default: "default" }, backgroundColor: { default: "default" }, textAlignment: { default: "left" } }, content: "inline" },
  numberedListItem: { props: { textColor: { default: "default" }, backgroundColor: { default: "default" }, textAlignment: { default: "left" } }, content: "inline" },
  checkListItem: { props: { checked: { default: false }, textColor: { default: "default" }, backgroundColor: { default: "default" }, textAlignment: { default: "left" } }, content: "inline" },
  quote: { props: { textColor: { default: "default" }, backgroundColor: { default: "default" } }, content: "inline" },
  codeBlock: { props: { language: { default: "text" } }, content: "inline" },
  table: { props: { textColor: { default: "default" } }, content: "table" },
  image: { props: { url: { default: "" }, caption: { default: "" }, name: { default: "" }, previewWidth: { default: null }, textAlignment: { default: "left" }, showPreview: { default: true } }, content: "none" },
  video: { props: { url: { default: "" }, caption: { default: "" }, name: { default: "" }, previewWidth: { default: null }, textAlignment: { default: "left" }, showPreview: { default: true } }, content: "none" },
  audio: { props: { url: { default: "" }, caption: { default: "" }, name: { default: "" }, showPreview: { default: true } }, content: "none" },
};

const blocks = {};
for (const [type, spec] of Object.entries({ ...BUILTIN, ...specs })) {
  const entries = library.filter((l) => l.type === type);
  blocks[type] = {
    label: entries[0]?.label ?? type,
    hint: entries[0]?.hint ?? "",
    category: entries[0]?.category ?? "other",
    insertable: entries.length > 0,
    content: spec.content,
    props: spec.props,
    ...(entries.some((e) => e.props) ? { presets: entries.filter((e) => e.props).map((e) => ({ label: e.label, props: e.props })) } : {}),
  };
}

const manifest = {
  generatedFrom: ["src/components/editor/customBlocks.tsx", "src/components/editor/RowLayoutBlock.tsx", "src/lib/blockLibrary.ts"],
  blockCount: Object.keys(blocks).length,
  blocks,
};
writeFileSync(OUT, JSON.stringify(manifest, null, 1) + "\n");
console.log(`block-manifest: ${manifest.blockCount} blocks → src/lib/blockManifest.json`);
