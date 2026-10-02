import * as net from 'net';

export interface WhoisResult {
	server: string;
	text: string;
}

const PORT = 43;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 256 * 1024;

/**
 * Server names come from remote replies, so only plain public-looking host names are contacted.
 */
export function isSafeServer(host: string): boolean {
	return (
		/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host) &&
		!/^[\d.]+$/.test(host) &&
		!/\.(local|localhost|internal|lan|home|corp)$/i.test(host)
	);
}

function query(server: string, request: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		const socket = net.connect({ host: server, port: PORT });
		socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error(`${server} did not answer in time`)));
		socket.on('connect', () => socket.write(`${request}\r\n`));
		socket.on('data', (chunk) => {
			size += chunk.length;
			chunks.push(chunk);
			if (size > MAX_BYTES) {
				socket.destroy();
			}
		});
		socket.on('error', reject);
		socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
	});
}

/**
 * Asks IANA which WHOIS server handles the TLD, queries it, then follows
 * the registrar referral that thin registries (such as .com) provide.
 */
export async function lookupWhois(domain: string): Promise<WhoisResult | undefined> {
	const tld = domain.slice(domain.lastIndexOf('.') + 1);
	const referral = /^whois:\s*(\S+)/im.exec(await query('whois.iana.org', tld))?.[1];
	if (!referral || !isSafeServer(referral)) {
		return undefined;
	}
	const registry = await query(referral, domain);

	const registrar = /Registrar WHOIS Server:\s*(\S+)/i.exec(registry)?.[1];
	if (registrar && registrar !== referral && isSafeServer(registrar)) {
		try {
			const detailed = await query(registrar, domain);
			if (detailed.trim()) {
				return { server: registrar, text: detailed.trim() };
			}
		} catch {
			// The registry answer is still useful.
		}
	}
	return { server: referral, text: registry.trim() };
}
