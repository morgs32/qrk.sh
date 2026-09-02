'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const LINK_RE = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*\)/g;
const LINE_FRAG_RE = /^L(\d+)(?:-L(\d+))?$/i;

function parseHref(href) {
  const hash = href.indexOf('#');
  const rawPath = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? '' : href.slice(hash + 1);
  const lineMatch = LINE_FRAG_RE.exec(fragment);
  return {
    rawPath: decodeURIComponent(rawPath),
    startLine: lineMatch ? Number(lineMatch[1]) - 1 : undefined,
    endLine: lineMatch && lineMatch[2] ? Number(lineMatch[2]) - 1 : undefined,
  };
}

function isExternal(href) {
  return /^(https?:|mailto:|vscode:|command:)/i.test(href);
}

function resolveFsPath(document, rawPath) {
  if (!rawPath || document.uri.scheme !== 'file') {
    return undefined;
  }
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(path.dirname(document.uri.fsPath), rawPath);
}

function* iterLinks(text) {
  LINK_RE.lastIndex = 0;
  let match;
  while ((match = LINK_RE.exec(text))) {
    if (match.index > 0 && text[match.index - 1] === '!') {
      continue;
    }
    yield {
      index: match.index,
      end: match.index + match[0].length,
      href: match[2],
    };
  }
}

function findLinkAt(document, position) {
  const offset = document.offsetAt(position);
  const text = document.getText();
  for (const link of iterLinks(text)) {
    if (offset >= link.index && offset <= link.end) {
      return link;
    }
  }
}

function toTarget(document, href) {
  if (!href || isExternal(href)) {
    return undefined;
  }
  const parsed = parseHref(href);
  const fsPath = resolveFsPath(document, parsed.rawPath);
  if (!fsPath) {
    return undefined;
  }
  try {
    if (!fs.existsSync(fsPath) || !fs.statSync(fsPath).isFile()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return {
    fsPath,
    startLine: parsed.startLine,
    endLine: parsed.endLine ?? parsed.startLine,
  };
}

async function openTarget(target) {
  const uri = vscode.Uri.file(target.fsPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  if (target.startLine === undefined) {
    return;
  }
  const last = doc.lineCount - 1;
  const startLine = Math.min(Math.max(target.startLine, 0), last);
  const endLine = Math.min(Math.max(target.endLine ?? startLine, 0), last);
  const start = new vscode.Position(startLine, 0);
  const end = doc.lineAt(endLine).range.end;
  const range = new vscode.Range(start, end);
  editor.selection = new vscode.Selection(start, end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function locationFor(target) {
  const start = new vscode.Position(target.startLine ?? 0, 0);
  const endLine = target.endLine ?? target.startLine ?? 0;
  return new vscode.Location(
    vscode.Uri.file(target.fsPath),
    new vscode.Range(start, new vscode.Position(endLine, 0)),
  );
}

function tooltipFor(target) {
  if (target.startLine === undefined) {
    return target.fsPath;
  }
  const from = target.startLine + 1;
  const to = (target.endLine ?? target.startLine) + 1;
  return to === from
    ? `${target.fsPath}:${from}`
    : `${target.fsPath}:${from}-${to}`;
}

let previewPanel;
let previewSourceUri;

async function renderPreview(panel, document) {
  previewSourceUri = document.uri;
  let html = document.getText();
  try {
    const rendered = await vscode.commands.executeCommand(
      'markdown.api.render',
      document.getText(),
    );
    html = typeof rendered === 'string' ? rendered : (rendered?.html ?? html);
  } catch {
    html = `<pre>${escapeHtml(document.getText())}</pre>`;
  }
  panel.title = `Preview ${path.basename(document.fileName)}`;
  panel.webview.html = getPreviewHtml(panel.webview, html);
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getPreviewHtml(webview, html) {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.55;
    max-width: 52rem;
    margin: 0 auto;
    padding: 1.5rem;
  }
  a { color: var(--vscode-textLink-foreground); cursor: pointer; }
  pre, code { font-family: var(--vscode-editor-font-family); }
  pre {
    overflow: auto;
    padding: 0.75rem;
    background: var(--vscode-textCodeBlock-background);
  }
</style>
</head>
<body>
${html}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:)/i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    vscode.postMessage({ type: 'open', href });
  }, true);
</script>
</body>
</html>`;
}

async function openPreview() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Open a markdown file first.');
    return;
  }
  if (!previewPanel) {
    previewPanel = vscode.window.createWebviewPanel(
      'zerospinMarkdownCodeLinks',
      `Preview ${path.basename(editor.document.fileName)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    );
    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
      previewSourceUri = undefined;
    });
    previewPanel.webview.onDidReceiveMessage(async message => {
      if (message?.type !== 'open' || !message.href || !previewSourceUri) {
        return;
      }
      const document =
        await vscode.workspace.openTextDocument(previewSourceUri);
      const target = toTarget(document, message.href);
      if (!target) {
        vscode.window.showWarningMessage(`Could not resolve ${message.href}`);
        return;
      }
      await openTarget(target);
    });
  }
  await renderPreview(previewPanel, editor.document);
  previewPanel.reveal(vscode.ViewColumn.Beside);
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('zerospin.openMarkdownCodeTarget', target =>
      openTarget(target),
    ),
    vscode.commands.registerCommand(
      'zerospin.openMarkdownCodeLink',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
          return;
        }
        const link = findLinkAt(editor.document, editor.selection.active);
        if (!link) {
          vscode.window.showWarningMessage('No markdown file link at cursor.');
          return;
        }
        const target = toTarget(editor.document, link.href);
        if (!target) {
          vscode.window.showWarningMessage(`Could not resolve ${link.href}`);
          return;
        }
        await openTarget(target);
      },
    ),
    vscode.commands.registerCommand('zerospin.previewMarkdownCodeLinks', () =>
      openPreview(),
    ),
    vscode.languages.registerDefinitionProvider(
      { language: 'markdown' },
      {
        provideDefinition(document, position) {
          const link = findLinkAt(document, position);
          if (!link) {
            return;
          }
          const target = toTarget(document, link.href);
          if (!target) {
            return;
          }
          return locationFor(target);
        },
      },
    ),
    vscode.languages.registerDocumentLinkProvider(
      { language: 'markdown' },
      {
        provideDocumentLinks(document) {
          const links = [];
          const text = document.getText();
          for (const link of iterLinks(text)) {
            const target = toTarget(document, link.href);
            if (!target) {
              continue;
            }
            const range = new vscode.Range(
              document.positionAt(link.index),
              document.positionAt(link.end),
            );
            const uri = vscode.Uri.parse(
              `command:zerospin.openMarkdownCodeTarget?${encodeURIComponent(JSON.stringify(target))}`,
            );
            const docLink = new vscode.DocumentLink(range, uri);
            docLink.tooltip = tooltipFor(target);
            links.push(docLink);
          }
          return links;
        },
      },
    ),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (
        previewPanel &&
        previewSourceUri &&
        event.document.uri.toString() === previewSourceUri.toString()
      ) {
        void renderPreview(previewPanel, event.document);
      }
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
