import { Resolver } from 'dns/promises';

export interface DnsGroup {
	type: string;
	records: string[];
	error?: string;
}

export interface DnsResult {
	groups: DnsGroup[];
	nxdomain: boolean;
}

const TIMEOUT_MS = 4000;

const RESOLVERS: Record<string, (resolver: Resolver, name: string) => Promise<string[]>> = {
	A: (resolver, name) => resolver.resolve4(name),
	AAAA: (resolver, name) => resolver.resolve6(name),
	CNAME: (resolver, name) => resolver.resolveCname(name),
	MX: async (resolver, name) =>
		(await resolver.resolveMx(name))
			.sort((a, b) => a.priority - b.priority)
			.map((record) => `${record.priority} ${record.exchange}`),
	NS: (resolver, name) => resolver.resolveNs(name),
	TXT: async (resolver, name) => (await resolver.resolveTxt(name)).map((chunks) => chunks.join('')),
	SOA: async (resolver, name) => {
		const soa = await resolver.resolveSoa(name);
		return [
			`${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minttl}`,
		];
	},
	CAA: async (resolver, name) =>
		(await resolver.resolveCaa(name)).map((record) => {
			const tag = ['issue', 'issuewild', 'iodef'].find((key) => key in record) ?? 'issue';
			return `${record.critical} ${tag} "${(record as unknown as Record<string, string>)[tag]}"`;
		}),
};

// Codes meaning "this name has no record of this type" rather than a failure.
const EMPTY_CODES = new Set(['ENODATA', 'ENOTFOUND', 'NODATA', 'NOTFOUND']);

export const DNS_TYPES = Object.keys(RESOLVERS);

export async function resolveDns(name: string): Promise<DnsResult> {
	const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
	let missing = 0;
	const groups = await Promise.all(
		DNS_TYPES.map(async (type): Promise<DnsGroup> => {
			try {
				return { type, records: await RESOLVERS[type](resolver, name) };
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code ?? '';
				if (code === 'ENOTFOUND' || code === 'NOTFOUND') {
					missing++;
				}
				if (EMPTY_CODES.has(code)) {
					return { type, records: [] };
				}
				return { type, records: [], error: code || (error as Error).message };
			}
		})
	);
	return { groups, nxdomain: missing === DNS_TYPES.length };
}
