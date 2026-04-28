import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const targets = [
  resolve('node_modules/@mercuryworkshop/epoxy-transport/dist/index.mjs'),
  resolve('node_modules/@mercuryworkshop/epoxy-transport/dist/index.js')
];

const originalBlock = `    try {\n      let headersObj = {};\n      for (let [key, value] of headers) {\n        if (headersObj[key]) {\n          console.warn(\n            \`Duplicate header key "\${key}" detected. Overwriting previous value.\`\n          );\n        }\n        headersObj[key] = value;\n      }`;

const patchedBlock = `    try {\n      const normalizeHeaders = (inputHeaders) => {\n        const normalized = [];\n\n        if (!inputHeaders) return normalized;\n\n        if (typeof Headers !== "undefined" && inputHeaders instanceof Headers) {\n          for (const [key, value] of inputHeaders.entries()) {\n            if (key != null && value != null) normalized.push([String(key), String(value)]);\n          }\n          return normalized;\n        }\n\n        if (Array.isArray(inputHeaders)) {\n          for (const entry of inputHeaders) {\n            if (!entry) continue;\n            const [key, value] = entry;\n            if (key != null && value != null) normalized.push([String(key), String(value)]);\n          }\n          return normalized;\n        }\n\n        if (typeof inputHeaders[Symbol.iterator] === "function") {\n          for (const entry of inputHeaders) {\n            if (!entry) continue;\n            const [key, value] = entry;\n            if (key != null && value != null) normalized.push([String(key), String(value)]);\n          }\n          return normalized;\n        }\n\n        if (typeof inputHeaders === "object") {\n          for (const [key, value] of Object.entries(inputHeaders)) {\n            if (value == null) continue;\n            if (Array.isArray(value)) {\n              for (const item of value) {\n                if (item != null) normalized.push([String(key), String(item)]);\n              }\n            } else {\n              normalized.push([String(key), String(value)]);\n            }\n          }\n        }\n\n        return normalized;\n      };\n\n      if (!globalThis.__epoxyHeadersDebugLogged) {\n        globalThis.__epoxyHeadersDebugLogged = true;\n        console.debug("[epoxy] request headers type", {\n          tag: Object.prototype.toString.call(headers),\n          isArray: Array.isArray(headers),\n          iterable: !!headers && typeof headers[Symbol.iterator] === "function",\n          keys: headers && typeof headers === "object" ? Object.keys(headers).slice(0, 10) : []\n        });\n      }\n\n      const safeHeaders = normalizeHeaders(headers);\n      let headersObj = {};\n      for (let [key, value] of safeHeaders) {\n        if (headersObj[key]) {\n          console.warn(\n            \`Duplicate header key "\${key}" detected. Overwriting previous value.\`\n          );\n        }\n        headersObj[key] = value;\n      }`;

for (const target of targets) {
  if (!existsSync(target)) {
    console.warn(`[patch-epoxy-headers] skipped missing file: ${target}`);
    continue;
  }

  const source = readFileSync(target, 'utf8');
  if (source.includes('globalThis.__epoxyHeadersDebugLogged')) {
    console.log(`[patch-epoxy-headers] already patched: ${target}`);
    continue;
  }

  if (!source.includes(originalBlock)) {
    throw new Error(`[patch-epoxy-headers] unable to locate patch block in ${target}`);
  }

  const patched = source.replace(originalBlock, patchedBlock);
  writeFileSync(target, patched, 'utf8');
  console.log(`[patch-epoxy-headers] patched: ${target}`);
}
