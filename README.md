# VSCode Whois

[![Release](https://img.shields.io/github/v/release/thomas-serment/VSCode-Whois)](https://github.com/thomas-serment/VSCode-Whois/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Look up WHOIS, RDAP and DNS records for any domain without leaving VS Code.

## Features

- Registration details: registrar, dates, days left before expiry, status, name servers, DNSSEC
- DNS records: A, AAAA, CNAME, MX, NS, TXT, SOA and CAA, with one-click copy
- Raw WHOIS output from the right server, including the registrar referral
- Select a domain or URL in any editor, right-click, **Look Up Domain**
- Recent lookups, internationalized domain names, light and dark themes

## Installation

1. Download the latest `.vsix` from the [Releases](https://github.com/thomas-serment/VSCode-Whois/releases/latest) page
2. In VS Code, run **Extensions: Install from VSIX...** and select the file

## Usage

Run **Whois: Look Up Domain** from the Command Palette and type a domain, or select one in an editor and use the context menu.

## Requirements

Internet access: lookups go to the IANA directory, the registry's RDAP and WHOIS servers (port 43) and your system DNS resolver.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
