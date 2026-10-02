export interface Registration {
	domain: string;
	registrar?: string;
	status: string[];
	registered?: string;
	updated?: string;
	expires?: string;
	nameservers: string[];
	dnssec?: boolean;
	source: string;
}

type Json = Record<string, any>;

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const TIMEOUT_MS = 10000;

let bootstrap: Promise<Json> | undefined;

async function getBootstrap(): Promise<Json> {
	bootstrap ??= fetch(BOOTSTRAP_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
		.then((response) => {
			if (!response.ok) {
				throw new Error(`IANA RDAP directory answered ${response.status}`);
			}
			return response.json() as Promise<Json>;
		})
		.catch((error) => {
			bootstrap = undefined;
			throw error;
		});
	return bootstrap;
}

/**
 * Finds the RDAP base URL of a TLD in the IANA bootstrap file, preferring https.
 */
export function serverFor(tld: string, directory: Json): string | undefined {
	for (const [tlds, urls] of directory.services ?? []) {
		if ((tlds as string[]).includes(tld)) {
			const url = (urls as string[]).find((candidate) => candidate.startsWith('https://')) ?? urls[0];
			return (url as string).replace(/^http:/, 'https:').replace(/\/?$/, '/');
		}
	}
	return undefined;
}

function vcardValue(entity: Json, field: string): string | undefined {
	const entry = (entity.vcardArray?.[1] ?? []).find((item: unknown[]) => item[0] === field);
	return typeof entry?.[3] === 'string' ? entry[3] : undefined;
}

function eventDate(json: Json, action: string): string | undefined {
	return (json.events ?? []).find((event: Json) => event.eventAction === action)?.eventDate;
}

export function summarize(json: Json, source: string): Registration {
	const registrar = (json.entities ?? []).find((entity: Json) => entity.roles?.includes('registrar'));
	return {
		domain: String(json.ldhName ?? '').toLowerCase(),
		registrar: registrar && (vcardValue(registrar, 'fn') ?? vcardValue(registrar, 'org')),
		status: json.status ?? [],
		registered: eventDate(json, 'registration'),
		updated: eventDate(json, 'last changed'),
		expires: eventDate(json, 'expiration'),
		nameservers: (json.nameservers ?? []).map((server: Json) => String(server.ldhName ?? '').toLowerCase().replace(/\.$/, '')),
		dnssec: json.secureDNS?.delegationSigned,
		source,
	};
}

export function daysUntil(iso: string | undefined, now = Date.now()): number | undefined {
	const time = iso ? Date.parse(iso) : NaN;
	return Number.isNaN(time) ? undefined : Math.ceil((time - now) / 86_400_000);
}

/**
 * Looks a domain up through RDAP. Returns undefined when the registry has no record for it.
 */
export async function lookupRdap(domain: string): Promise<Registration | undefined> {
	const tld = domain.slice(domain.lastIndexOf('.') + 1);
	const server = serverFor(tld, await getBootstrap());
	if (!server) {
		throw new Error(`No RDAP service is published for .${tld}`);
	}
	const response = await fetch(`${server}domain/${encodeURIComponent(domain)}`, {
		headers: { Accept: 'application/rdap+json' },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (response.status === 404) {
		return undefined;
	}
	if (!response.ok) {
		throw new Error(`The RDAP server answered ${response.status}`);
	}
	return summarize((await response.json()) as Json, new URL(server).hostname);
}
