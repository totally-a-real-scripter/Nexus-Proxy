import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const targets = [
  resolve('node_modules/@mercuryworkshop/epoxy-transport/dist/index.mjs'),
  resolve('node_modules/@mercuryworkshop/epoxy-transport/dist/index.js')
];

const originalBlock = `    try {\n      let headersObj = {};\n      for (let [key, value] of headers) {\n        if (headersObj[key]) {\n          console.warn(\n            \`Duplicate header key "\${key}" detected. Overwriting previous value.\`\n          );\n        }\n        headersObj[key] = value;\n      }`;

const patchedBlock = `    try {\n      const normalizeHeaders = (inputHeaders) => {\n        const normalized = [];\n\n        if (!inputHeaders) return normalized;\n\n        if (typeof Headers !== "undefined" && inputHeaders instanceof Headers) {\n          for (const [key, value] of inputHeaders.entries()) {\n            if (key != null && value != null) normalized.push([String(key), String(value)]);\n          }\n          return normalized;\n        }\n\n        if (Array.isArray(inputHeaders)) {\n          for (const entry of inputHeaders) {\n            if (!entry) continue;\n            const [key, value] = entry;\n            if (key != null && value != null) normalized.push([String(key), String(value)]);\n          }\n          return normalized;\n        }\n\n        if (typeof inputHeaders[Symbol.iterator] === "function") {\n          for (const entry of inputHeaders) {\n            if (!entry) continue;\n            const [key, value] = entry;\n            if (key != null && value != null) normalized.push([String(key), String(value)]);\n          }\n          return normalized;\n        }\n\n        if (typeof inputHeaders === "object") {\n          for (const [key, value] of Object.entries(inputHeaders)) {\n            if (value == null) continue;\n            if (Array.isArray(value)) {\n              for (const item of value) {\n                if (item != null) normalized.push([String(key), String(item)]);\n              }\n            } else {\n              normalized.push([String(key), String(value)]);\n            }\n          }\n        }\n\n        return normalized;\n      };\n\n      const safeHeaders = normalizeHeaders(headers);\n      let headersObj = {};\n      for (let [key, value] of safeHeaders) {\n        if (headersObj[key]) {\n          console.warn(\n            \`Duplicate header key "\${key}" detected. Overwriting previous value.\`\n          );\n        }\n        headersObj[key] = value;\n      }`;

const responseBlock = `      return {\n        body: res.body,\n        headers: headersEntries,\n        status: res.status,\n        statusText: res.statusText\n      };`;

const responsePatch = `      const rawHeaders = {};\n      for (let [key, value] of Object.entries(res.rawHeaders || {})) {\n        if (value == null) continue;\n\n        if (Array.isArray(value)) {\n          rawHeaders[key] = value.map((item) => String(item));\n        } else {\n          rawHeaders[key] = String(value);\n        }\n      }\n\n      const finalURL =\n        typeof res.url === "string" && res.url\n          ? res.url\n          : typeof remote?.href === "string"\n            ? remote.href\n            : String(remote ?? "");\n\n      return {\n        body: res.body,\n        headers: rawHeaders,\n        rawHeaders,\n        status: res.status,\n        statusText: res.statusText,\n        finalURL,\n        url: finalURL\n      };`;

for (const target of targets) {
  if (!existsSync(target)) {
    console.warn(`[patch-epoxy-headers] skipped missing file: ${target}`);
    continue;
  }

  const source = readFileSync(target, 'utf8');
  let patchedSource = source;

  if (!patchedSource.includes('const safeHeaders = normalizeHeaders(headers);')) {
    if (!patchedSource.includes(originalBlock)) {
      throw new Error(`[patch-epoxy-headers] unable to locate header normalization block in ${target}`);
    }
    patchedSource = patchedSource.replace(originalBlock, patchedBlock);
  }

  if (!patchedSource.includes('rawHeaders,\n        status: res.status')) {
    if (patchedSource.includes(responseBlock)) {
      patchedSource = patchedSource.replace(responseBlock, responsePatch);
    } else {
      const headersEntriesBlock = `      let headersEntries = [];\n      for (let [key, value] of Object.entries(res.rawHeaders)) {\n        if (Array.isArray(value)) {\n          for (let v of value) {\n            headersEntries.push([key, v]);\n          }\n        } else {\n          headersEntries.push([key, value]);\n        }\n      }\n      const finalURL =\n        typeof res.url === "string" && res.url\n          ? res.url\n          : typeof remote?.href === "string"\n            ? remote.href\n            : String(remote ?? "");\n\n      return {\n        body: res.body,\n        headers: headersEntries,\n        status: res.status,\n        statusText: res.statusText,\n        finalURL,\n        url: finalURL\n      };`;
      if (!patchedSource.includes(headersEntriesBlock)) {
        throw new Error(`[patch-epoxy-headers] unable to locate response return block in ${target}`);
      }
      patchedSource = patchedSource.replace(headersEntriesBlock, responsePatch);
    }
  }

  if (patchedSource !== source) {
    writeFileSync(target, patchedSource, 'utf8');
    console.log(`[patch-epoxy-headers] patched: ${target}`);
  } else {
    console.log(`[patch-epoxy-headers] already patched: ${target}`);
  }
}
