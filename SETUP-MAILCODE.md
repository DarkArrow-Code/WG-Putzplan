# WG-Mail Code im Putzplan

Die Seite **Mail-Code** zeigt allen eingeloggten Mitbewohnern den Sicherheitscode für das gemeinsame Outlook-Konto. Es gibt zwei Quellen, die einzeln oder zusammen genutzt werden können.

> Nach dem Update muss sich jeder **einmal neu einloggen** (die App nutzt jetzt echte Login-Tokens, ohne Token ist der Code nicht abrufbar).

## A) Authenticator-Code (empfohlen)

Die App erzeugt denselben 6-stelligen Code wie eine Authenticator-App. Mails werden dafür nicht gebraucht.

1. Mit dem WG-Konto bei <https://account.microsoft.com/security> anmelden → erweiterte Sicherheitsoptionen → neue Anmelde-/Überprüfungsmethode → **App** → „Andere Authenticator-App einrichten“.
2. Statt den QR-Code zu scannen auf „Ich kann das Bild nicht scannen“ tippen und den **geheimen Schlüssel** kopieren.
3. Cloudflare Dashboard → Workers & Pages → `wg-putzplan` → Settings → Variables and Secrets → **Secret** `WG_TOTP_SECRET` mit dem Schlüssel anlegen (für Production). Danach neu deployen.
4. In der App auf **Mail-Code** gehen und den angezeigten Code bei Microsoft eingeben, um die Einrichtung abzuschließen.
5. Danach in den Sicherheitsoptionen die alte private Mailadresse als Überprüfungsmethode entfernen.

Lokal testen: `.dev.vars` mit `WG_TOTP_SECRET=...` anlegen (ist in `.gitignore`).

## B) Codes per Mail weiterleiten (optional)

Falls Microsoft trotzdem einen Code per Mail verschickt, kann er automatisch in der App landen. Voraussetzung: eine eigene Domain, die bei Cloudflare liegt.

1. Worker deployen:
   ```bash
   cd email-worker
   npm install
   npx wrangler deploy
   ```
2. Cloudflare Dashboard → Domain → **Email → Email Routing** aktivieren → Routing-Regel: z. B. `wg-codes@deine-domain.de` → Aktion **Send to a Worker** → `wg-putzplan-mailcode`.
3. Im Microsoft-Konto `wg-codes@deine-domain.de` als **Sicherheits-E-Mail** hinzufügen. Den Bestätigungscode findest du direkt in der App unter Mail-Code.
4. Alternative ohne neue Sicherheitsadresse: In deinem Postfach eine Weiterleitungsregel für Mails von `account-security-noreply@accountprotection.microsoft.com` an diese Adresse anlegen und deine eigene Adresse in `ALLOWED_SENDERS` (email-worker/wrangler.toml) ergänzen.

Der Worker akzeptiert nur Absender aus `ALLOWED_SENDERS`, speichert nur die Ziffern und die App zeigt Codes höchstens 15 Minuten lang an. Codes älter als ein Tag werden gelöscht.

## Sicherheit

- `/api/wg-code` ist nur mit gültigem Login-Token erreichbar (90 Tage gültig, Logout löscht ihn).
- Die übrigen API-Endpoints (Aufgaben, Abwesenheiten …) sind weiterhin ohne Token erreichbar. Sie können bei Bedarf mit derselben `requireAuth`-Middleware abgesichert werden.
