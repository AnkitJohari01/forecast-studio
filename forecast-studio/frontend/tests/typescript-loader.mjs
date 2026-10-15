import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import ts from 'typescript';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    for (const extension of ['.ts', '.tsx']) {
      const url = new URL(specifier + extension, context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (/\.tsx?$/.test(url)) {
    const source = ts.transpileModule((await readFile(new URL(url), 'utf8')).replaceAll('import.meta.env', '({})'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    return { format: 'module', source, shortCircuit: true };
  }
  return next(url, context);
}
