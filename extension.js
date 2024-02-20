const vscode = require("vscode");
const path = require("path");
const dns = require("dns");

function activate(context) {
	let disposable = vscode.commands.registerCommand(
		"extension.codeWhois",
		async () => {
			// Demander à l'utilisateur d'entrer le domaine
			const domain = await vscode.window.showInputBox({
				prompt: "Entrez le domaine pour la recherche Whois",
				placeHolder: "Exemple: google.com",
			});

			if (!domain) {
				// Si l'utilisateur n'entre pas de domaine, ne rien faire
				return;
			}

			const panel = vscode.window.createWebviewPanel(
				"codeWhois",
				"Résultat Whois pour " + domain,
				vscode.ViewColumn.One,
				{
					enableScripts: true,
				}
			);

			const htmlPath = path.join(context.extensionPath, "index.html");
			panel.webview.html = getHtmlContent(htmlPath);

			// Effectuer une requête DNS pour obtenir tous les enregistrements possibles
			dns.resolveAny(domain, (err, records) => {
				if (err) {
					console.error(
						"Erreur lors de la résolution des enregistrements DNS:",
						err
					);
					return;
				}
				console.log("Enregistrements DNS pour", domain, ":", records);
				// Envoyer les résultats DNS au panneau Webview
				panel.webview.postMessage({
					command: "updateDnsRecords",
					data: records,
				});
			});

			// Effectuer la recherche Whois et envoyer les résultats au panneau Webview
			const whois = require("whois");
			whois.lookup(domain, function (err, data) {
				if (err) {
					console.error(err);
					return;
				}
				panel.webview.postMessage({ command: "updateWhoisData", data: data });
				console.log("🚀 ~ data:", data);
			});
		}
	);

	context.subscriptions.push(disposable);
}

function getHtmlContent(htmlPath) {
	const fs = require("fs");
	return fs.readFileSync(htmlPath, "utf8");
}

exports.activate = activate;
