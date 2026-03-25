import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_HEADER = `// ==UserScript==
// @name         ChatGPT Question Navigator Stable
// @namespace    https://chatgpt.com/
// @version      1.0.0
// @description  Stable right-side question navigator for ChatGPT conversations
// @author       OpenAI
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==`;

const MODULE_PATHS = [
  'src/core.js',
  'src/dom.js',
  'src/ui.js',
  'src/navigation.js',
  'src/runtime.js',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'ChatGPT_Question_Navigator_Stable.js');

async function readModule(modulePath) {
  const absPath = path.join(repoRoot, modulePath);
  return fs.readFile(absPath, 'utf8');
}

const moduleContents = await Promise.all(MODULE_PATHS.map(readModule));

const output = [
  SCRIPT_HEADER,
  '',
  '(function () {',
  "  'use strict';",
  '',
  '  // Generated from src/*.js by scripts/build-userscript.mjs. Do not edit directly.',
  '',
  moduleContents.map((content) => content.trimEnd()).join('\n\n'),
  '})();',
  '',
].join('\n');

await fs.writeFile(outputPath, output, 'utf8');

console.log(`Built ${path.basename(outputPath)} from ${MODULE_PATHS.length} source files.`);
