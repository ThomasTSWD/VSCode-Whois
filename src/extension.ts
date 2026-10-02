import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { resolveDns } from './dns';
import { errorMessage, lookupCandidates, parseDomain } from './domain';
import { daysUntil, lookupRdap, Registration } from './rdap';
import { getHtml } from './webview';
import { lookupWhois } from './whois';

const HISTORY_KEY = 'history';
const HISTORY_SIZE = 10;

let panel: vscode.WebviewPanel | undefined;
let ready = false;
let pending: string | undefined;
let counter = 0;

async function findRegistration(candidates: string[]): Promise<Registration | undefined> {
	for (const candidate of candidates) {
		const registration = await lookupRdap(candidate);
		if (registration) {
			return registration;
		}
	}
	return undefined;
}

async function remember(context: vscode.ExtensionContext, name: string): Promise<string[]> {
	const previous = context.globalState.get<string[]>(HISTORY_KEY, []);
	const history = [name, ...previous.filter((item) => item !== name)].slice(0, HISTORY_SIZE);
	await context.globalState.update(HISTORY_KEY, history);
	return history;
}

async function lookup(context: vscode.ExtensionContext, webview: vscode.Webview, input: string): Promise<void> {
	const domain = parseDomain(input);
	if (!domain) {
		void webview.postMessage({
			type: 'invalid',
			message: 'Enter a valid domain name, for example example.com.',
		});
		return;
	}

	const id = ++counter;
	const post = (message: object) => {
		if (id === counter) {
			void webview.postMessage({ id, ...message });
		}
	};

	void webview.postMessage({ type: 'history', list: await remember(context, domain.unicode) });
	post({ type: 'start', ascii: domain.ascii, unicode: domain.unicode });

	const dns = resolveDns(domain.ascii).then(
		(result) => post({ type: 'dns', ...result }),
		(error) => post({ type: 'dns', error: errorMessage(error) })
	);

	const registration = findRegistration(lookupCandidates(domain.ascii)).then(
		(found) => {
			if (found) {
				post({
					type: 'registration',
					registration: found,
					lookedUpAs: found.domain !== domain.ascii ? found.domain : undefined,
					daysLeft: daysUntil(found.expires),
				});
			} else {
				post({
					type: 'registration',
					notFound: true,
					error: 'No registration record found. The domain may be available.',
				});
			}
			return found?.domain;
		},
		(error) => {
			post({ type: 'registration', error: errorMessage(error) });
			return undefined;
		}
	);

	const whois = registration
		.then((name) => lookupWhois(name ?? domain.ascii))
		.then(
			(result) =>
				post(
					result
						? { type: 'whois', ...result }
						: { type: 'whois', unavailable: true, error: 'No WHOIS server is published for this TLD.' }
				),
			(error) => post({ type: 'whois', error: errorMessage(error) })
		);

	await Promise.all([dns, whois]);
}

function showPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
	if (panel) {
		panel.reveal();
		return panel;
	}
	const created = vscode.window.createWebviewPanel('codewhois', 'Whois', vscode.ViewColumn.Beside, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [],
	});
	created.webview.html = getHtml(randomBytes(16).toString('base64'));
	created.webview.onDidReceiveMessage(
		async (message: { type: string; [key: string]: unknown }) => {
			switch (message.type) {
				case 'ready':
					ready = true;
					void created.webview.postMessage({
						type: 'history',
						list: context.globalState.get<string[]>(HISTORY_KEY, []),
					});
					if (pending) {
						void lookup(context, created.webview, pending);
						pending = undefined;
					}
					break;
				case 'lookup':
					if (typeof message.domain === 'string') {
						await lookup(context, created.webview, message.domain);
					}
					break;
				case 'clearHistory':
					await context.globalState.update(HISTORY_KEY, []);
					void created.webview.postMessage({ type: 'history', list: [] });
					break;
				case 'copy':
					if (typeof message.text === 'string') {
						await vscode.env.clipboard.writeText(message.text);
						void created.webview.postMessage({ type: 'copied', token: message.token });
					}
					break;
			}
		},
		undefined,
		context.subscriptions
	);
	created.onDidDispose(() => {
		panel = undefined;
		ready = false;
		pending = undefined;
		counter++;
	});
	panel = created;
	return created;
}

function selectedText(): string | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.selection.isEmpty) {
		return undefined;
	}
	return editor.document.getText(editor.selection).trim();
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('codewhois.lookup', () => {
			const selection = selectedText();
			const target = showPanel(context);
			if (!selection) {
				return;
			}
			if (ready) {
				void lookup(context, target.webview, selection);
			} else {
				pending = selection;
			}
		})
	);
}

export function deactivate() {}
