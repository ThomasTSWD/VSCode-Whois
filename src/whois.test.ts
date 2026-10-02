import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntil, serverFor, summarize } from './rdap';
import { lookupCandidates, parseDomain } from './domain';
import { isSafeServer } from './whois';
import { getHtml } from './webview';

test('parseDomain extracts the host from URLs, e-mails and IDNs', () => {
	assert.equal(parseDomain('Example.COM')?.ascii, 'example.com');
	assert.equal(parseDomain('https://www.example.com:8080/a?b#c')?.ascii, 'www.example.com');
	assert.equal(parseDomain('user@example.org')?.ascii, 'example.org');
	assert.equal(parseDomain('example.com.')?.ascii, 'example.com');
	assert.deepEqual(parseDomain('café.fr'), { ascii: 'xn--caf-dma.fr', unicode: 'café.fr' });
});

test('parseDomain rejects anything that is not a domain name', () => {
	for (const input of ['', 'localhost', '1.2.3.4', 'a_b.com', '-a.com', 'a b.com', '[::1]', 'x'.repeat(64) + '.com']) {
		assert.equal(parseDomain(input), undefined, input);
	}
});

test('lookupCandidates goes from the full name down to the TLD plus one label', () => {
	assert.deepEqual(lookupCandidates('www.example.co.uk'), ['www.example.co.uk', 'example.co.uk', 'co.uk']);
	assert.deepEqual(lookupCandidates('example.com'), ['example.com']);
});

test('serverFor prefers https and normalizes the base URL', () => {
	const directory = { services: [[['fr', 're'], ['http://rdap.nic.fr']], [['com'], ['http://a/', 'https://rdap.verisign.com/com/v1/']]] };
	assert.equal(serverFor('fr', directory), 'https://rdap.nic.fr/');
	assert.equal(serverFor('com', directory), 'https://rdap.verisign.com/com/v1/');
	assert.equal(serverFor('zz', directory), undefined);
});

test('summarize reads the registrar, dates, name servers and DNSSEC', () => {
	const registration = summarize(
		{
			ldhName: 'EXAMPLE.COM',
			status: ['active'],
			events: [
				{ eventAction: 'registration', eventDate: '2000-01-01T00:00:00Z' },
				{ eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' },
			],
			nameservers: [{ ldhName: 'NS1.EXAMPLE.COM.' }],
			secureDNS: { delegationSigned: true },
			entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Acme Registrar']]] }],
		},
		'rdap.test'
	);
	assert.equal(registration.domain, 'example.com');
	assert.equal(registration.registrar, 'Acme Registrar');
	assert.equal(registration.registered, '2000-01-01T00:00:00Z');
	assert.deepEqual(registration.nameservers, ['ns1.example.com']);
	assert.equal(registration.dnssec, true);
});

test('daysUntil counts days and tolerates missing dates', () => {
	const now = Date.parse('2026-01-01T00:00:00Z');
	assert.equal(daysUntil('2026-01-31T00:00:00Z', now), 30);
	assert.equal(daysUntil('2025-12-30T00:00:00Z', now), -2);
	assert.equal(daysUntil(undefined, now), undefined);
	assert.equal(daysUntil('nonsense', now), undefined);
});

test('isSafeServer refuses IPs, local names and malformed hosts', () => {
	assert.equal(isSafeServer('whois.verisign-grs.com'), true);
	for (const host of ['127.0.0.1', 'localhost', 'router.local', 'a b.com', 'x', '10.0.0.1']) {
		assert.equal(isSafeServer(host), false, host);
	}
});

test('getHtml uses a nonce-based CSP and no inline event handlers', () => {
	const html = getHtml('abc123');
	assert.match(html, /default-src 'none'/);
	assert.match(html, /script-src 'nonce-abc123'/);
	assert.doesNotMatch(html, /\sstyle=|\sonclick=|innerHTML/);
});
