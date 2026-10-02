const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
	margin: 0; padding: 24px 16px 48px;
	color: var(--vscode-foreground); background: var(--vscode-editor-background);
	font: var(--vscode-font-size, 13px) var(--vscode-font-family, sans-serif);
}
main { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
h1 { margin: 0; font-size: 1.5em; font-weight: 600; }
h2 { margin: 0; font-size: 1.05em; font-weight: 600; }
.subtitle, .muted { color: var(--vscode-descriptionForeground); }
.subtitle { margin: 4px 0 0; }
form { display: flex; gap: 8px; }
input[type=text] {
	flex: 1; min-width: 0; padding: 6px 10px; font: inherit;
	color: var(--vscode-input-foreground); background: var(--vscode-input-background);
	border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px;
}
input[type=text]:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
button {
	padding: 6px 14px; border: 1px solid transparent; border-radius: 2px; cursor: pointer; font: inherit;
	color: var(--vscode-button-foreground); background: var(--vscode-button-background);
}
button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
button.secondary {
	color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground);
}
button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
button.small { padding: 1px 8px; font-size: 0.9em; }
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip {
	padding: 2px 10px; border-radius: 10px; cursor: pointer; font: inherit;
	color: var(--vscode-foreground); background: var(--vscode-input-background);
	border: 1px solid var(--vscode-panel-border);
}
.chip:hover { border-color: var(--vscode-focusBorder); }
.error {
	padding: 8px 12px; border-radius: 4px; color: var(--vscode-errorForeground);
	border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
	background: var(--vscode-inputValidation-errorBackground, transparent);
}
.title { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; }
.title h2 { font-size: 1.4em; word-break: break-all; }
.card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: hidden; }
.card > header {
	display: flex; gap: 8px; align-items: center; padding: 8px 14px;
	border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-input-background);
}
.card > header .spacer { flex: 1; }
.card .body { padding: 12px 14px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }
dt { color: var(--vscode-descriptionForeground); }
dd { margin: 0; word-break: break-word; }
.badge {
	display: inline-block; margin: 0 6px 4px 0; padding: 1px 8px; border-radius: 10px; font-size: 0.9em;
	color: var(--vscode-badge-foreground); background: var(--vscode-badge-background);
}
.warn { color: var(--vscode-editorWarning-foreground); }
.bad { color: var(--vscode-errorForeground); }
.ok { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
.group + .group { margin-top: 14px; }
.group h3 { margin: 0 0 4px; font-size: 0.95em; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); }
.record {
	display: flex; gap: 8px; align-items: baseline; justify-content: space-between; padding: 3px 0;
	border-top: 1px solid var(--vscode-panel-border);
}
.record code, pre {
	font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px);
	word-break: break-all; white-space: pre-wrap;
}
pre { margin: 0; max-height: 420px; overflow: auto; }
#results > * + * { margin-top: 16px; }
#whois-head { display: contents; }
`;

const SCRIPT = String.raw`
const vscode = acquireVsCodeApi();
const $ = (id) => document.getElementById(id);
const els = {
	form: $('form'), input: $('domain'), recent: $('recent'), recentList: $('recent-list'), clear: $('clear'),
	error: $('error'), results: $('results'), name: $('name'), alias: $('alias'),
	registration: $('registration'), dns: $('dns'), whois: $('whois'), whoisHead: $('whois-head'),
};
let current = 0;
let tokens = 0;
const copyButtons = new Map();

function h(tag, attrs, ...children) {
	const element = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs || {})) {
		if (key === 'class') { element.className = value; }
		else if (key.startsWith('on')) { element.addEventListener(key.slice(2), value); }
		else { element.setAttribute(key, value); }
	}
	for (const child of children.flat(Infinity)) {
		if (child !== null && child !== undefined && child !== false) {
			element.append(child.nodeType ? child : document.createTextNode(String(child)));
		}
	}
	return element;
}

function setBody(container, ...children) {
	container.replaceChildren(...children.flat(Infinity).filter(Boolean));
}

function copyButton(text, label) {
	const button = h('button', { class: 'secondary small', type: 'button', title: 'Copy to clipboard' }, label || 'Copy');
	button.addEventListener('click', () => {
		const token = ++tokens;
		copyButtons.set(token, { button, label: label || 'Copy' });
		vscode.postMessage({ type: 'copy', text, token });
	});
	return button;
}

function showError(message) {
	els.error.textContent = message;
	els.error.hidden = !message;
}

function lookup(value) {
	const domain = value.trim();
	if (domain) { vscode.postMessage({ type: 'lookup', domain }); }
}

function formatDate(iso) {
	if (!iso) { return h('span', { class: 'muted' }, 'Unknown'); }
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

function expiry(registration, days) {
	if (!registration.expires) { return h('span', { class: 'muted' }, 'Unknown'); }
	let note = null;
	if (typeof days === 'number') {
		const text = days < 0 ? 'expired ' + -days + ' days ago' : days + ' days left';
		note = h('span', { class: days < 0 ? 'bad' : days < 30 ? 'warn' : 'muted' }, ' (' + text + ')');
	}
	return [formatDate(registration.expires), note];
}

function renderRegistration(data) {
	if (data.error) {
		setBody(els.registration, h('div', { class: data.notFound ? 'muted' : 'bad' }, data.error));
		return;
	}
	const r = data.registration;
	const rows = [
		['Registrar', r.registrar || h('span', { class: 'muted' }, 'Unknown')],
		['Registered', formatDate(r.registered)],
		['Updated', formatDate(r.updated)],
		['Expires', expiry(r, data.daysLeft)],
		['DNSSEC', r.dnssec === undefined ? h('span', { class: 'muted' }, 'Unknown') : r.dnssec ? 'Signed' : 'Unsigned'],
		['Status', r.status.length ? r.status.map((status) => h('span', { class: 'badge' }, status)) : h('span', { class: 'muted' }, 'None')],
		['Name servers', r.nameservers.length ? r.nameservers.map((server) => h('div', {}, h('code', {}, server))) : h('span', { class: 'muted' }, 'None')],
		data.lookedUpAs ? ['Looked up as', h('code', {}, data.lookedUpAs)] : null,
		['Source', h('span', { class: 'muted' }, 'RDAP via ' + r.source)],
	];
	setBody(els.registration, h('dl', {}, rows.filter(Boolean).map(([term, value]) => [h('dt', {}, term), h('dd', {}, value)])));
}

function renderDns(data) {
	if (data.error) {
		setBody(els.dns, h('div', { class: 'bad' }, data.error));
		return;
	}
	if (data.nxdomain) {
		setBody(els.dns, h('div', { class: 'muted' }, 'This domain does not exist in DNS (NXDOMAIN).'));
		return;
	}
	const groups = data.groups.filter((group) => group.records.length || group.error);
	if (!groups.length) {
		setBody(els.dns, h('div', { class: 'muted' }, 'No DNS records found.'));
		return;
	}
	setBody(els.dns, groups.map((group) => h('div', { class: 'group' },
		h('h3', {}, group.type),
		group.error
			? h('div', { class: 'bad' }, 'Lookup failed: ' + group.error)
			: group.records.map((record) => h('div', { class: 'record' }, h('code', {}, record), copyButton(record)))
	)));
}

function renderWhois(data) {
	els.whoisHead.replaceChildren();
	if (data.error) {
		setBody(els.whois, h('div', { class: data.unavailable ? 'muted' : 'bad' }, data.error));
		return;
	}
	els.whoisHead.append(h('span', { class: 'muted' }, data.server), h('span', { class: 'spacer' }), copyButton(data.text, 'Copy all'));
	setBody(els.whois, h('pre', {}, data.text));
}

function renderRecent(list) {
	els.recent.hidden = list.length === 0;
	els.recentList.replaceChildren(...list.map((name) => h('button', { class: 'chip', type: 'button', onclick: () => { els.input.value = name; lookup(name); } }, name)));
}

els.form.addEventListener('submit', (event) => { event.preventDefault(); lookup(els.input.value); });
els.clear.addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message.type === 'history') { renderRecent(message.list); return; }
	if (message.type === 'invalid') { showError(message.message); return; }
	if (message.type === 'copied') {
		const entry = copyButtons.get(message.token);
		if (entry) {
			copyButtons.delete(message.token);
			entry.button.textContent = 'Copied';
			setTimeout(() => { entry.button.textContent = entry.label; }, 1200);
		}
		return;
	}
	if (message.type === 'start') {
		current = message.id;
		showError('');
		els.input.value = message.unicode;
		els.name.textContent = message.unicode;
		els.alias.textContent = message.unicode !== message.ascii ? message.ascii : '';
		els.results.hidden = false;
		for (const container of [els.registration, els.dns, els.whois]) {
			setBody(container, h('div', { class: 'muted' }, 'Loading...'));
		}
		els.whoisHead.replaceChildren();
		return;
	}
	if (message.id !== current) { return; }
	if (message.type === 'registration') { renderRegistration(message); }
	if (message.type === 'dns') { renderDns(message); }
	if (message.type === 'whois') { renderWhois(message); }
});
vscode.postMessage({ type: 'ready' });
`;

export function getHtml(nonce: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Whois</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
	<header>
		<h1>Domain lookup</h1>
		<p class="subtitle">Registration (RDAP), DNS records and WHOIS for any domain.</p>
	</header>

	<form id="form">
		<input type="text" id="domain" placeholder="example.com" aria-label="Domain name" autocomplete="off" spellcheck="false" autofocus>
		<button type="submit">Look up</button>
	</form>

	<div class="chips" id="recent" hidden>
		<span class="muted">Recent</span>
		<span class="chips" id="recent-list"></span>
		<button class="secondary small" id="clear" type="button">Clear</button>
	</div>

	<div class="error" id="error" role="alert" hidden></div>

	<div id="results" hidden>
		<div class="title">
			<h2 id="name"></h2>
			<span class="muted" id="alias"></span>
		</div>

		<section class="card">
			<header><h2>Registration</h2></header>
			<div class="body" id="registration"></div>
		</section>

		<section class="card">
			<header><h2>DNS records</h2></header>
			<div class="body" id="dns"></div>
		</section>

		<section class="card">
			<header><h2>WHOIS</h2><span id="whois-head"></span></header>
			<div class="body" id="whois"></div>
		</section>
	</div>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}
