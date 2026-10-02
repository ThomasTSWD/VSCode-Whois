import { domainToASCII, domainToUnicode } from 'url';

export interface Domain {
	ascii: string;
	unicode: string;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Extracts a domain name from user input: accepts URLs, e-mail addresses,
 * trailing dots and internationalized names. Returns undefined for anything else.
 */
export function parseDomain(input: string): Domain | undefined {
	if (input.length > 2048) {
		return undefined;
	}
	const host = input
		.trim()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
		.replace(/^[^@/?#]*@/, '')
		.split(/[/?#:]/)[0]
		.replace(/\.+$/, '');
	const ascii = domainToASCII(host.toLowerCase());
	if (!ascii || ascii.length > 253) {
		return undefined;
	}
	const labels = ascii.split('.');
	if (labels.length < 2 || !labels.every((label) => LABEL.test(label)) || /^\d+$/.test(labels[labels.length - 1])) {
		return undefined;
	}
	return { ascii, unicode: domainToUnicode(ascii) };
}

/**
 * Names to try for registration data, longest first: www.example.co.uk,
 * example.co.uk, co.uk. The first one that has a record wins.
 */
export function lookupCandidates(domain: string): string[] {
	const labels = domain.split('.');
	return labels.slice(0, labels.length - 1).map((_, index) => labels.slice(index).join('.'));
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
