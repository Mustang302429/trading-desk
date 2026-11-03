# Trading Desk

Web app gratuita per analisi tecnica, macro e news su oro, argento e Forex (prezzi spot CFD da Dukascopy). Nessun costo: GitHub Pages + GitHub Actions + fonti pubbliche.

## Cosa contiene
- **Oggi**: riepilogo mattutino, massimi/minimi delle sessioni (Asia, Londra, New York) per oro e valute, driver di mercato per oro e per ogni valuta (USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD), livelli giorno/settimana/mese precedenti, ADR, driver dell'oro.
- **Scanner**: 12 strumenti in ordine di punteggio (tecnica multi-timeframe + fondamentale + COT + calendario) con entry, SL, TP e stato ("In zona", "Vicino", "Bloccato: news").
- **Analisi**: analisi completa dello strumento (RSI 14, ATR14, pivot fractal, floor pivot, Break&Retest, Fibonacci, scenari) e backtest storico del punteggio.
- **Macro**: pagella delle valute, dati dei paesi (tassi, inflazione, PIL, disoccupazione, rendimenti), COT CFTC, calendario con sorpresa dato/previsione, oro fisico BullionVault.
- **News**: feed RSS, blocco avvisi prima degli eventi ad alto impatto, link a Newsquawk, Finviz, Trading Economics.
- **Rischio**: calcolatore lotti.

## Pubblicazione su GitHub (una volta sola)
1. Crea un nuovo repository **pubblico** su github.com (es. `trading-desk`). Pubblico = Pages e Actions gratuite e illimitate.
2. Carica tutti i file di questa cartella (Add file > Upload files). Per la cartella `.github` nascosta: crea il file con "Add file > Create new file", nome `.github/workflows/update.yml`, e incolla il contenuto.
3. Settings > Pages > Source: "Deploy from a branch", branch `main`, cartella `/ (root)`. Dopo un minuto il sito è su `https://TUONOME.github.io/trading-desk/`.
4. Settings > Actions > General > Workflow permissions: "Read and write permissions".
5. Tab Actions > "Aggiorna dati" > "Run workflow" per il primo aggiornamento. Poi gira da solo ogni 15 minuti.

## Avvisi Telegram (facoltativi)
1. Su Telegram apri **@BotFather**, scrivi `/newbot`, scegli nome e username. Copia il **token**.
2. Apri il tuo nuovo bot e scrivigli un messaggio qualsiasi (es. "ciao").
3. Apri nel browser `https://api.telegram.org/botTOKEN/getUpdates` (sostituisci TOKEN). Copia il numero in `"chat":{"id": ...}`: è il **chat ID**.
4. Nel repository: Settings > Secrets and variables > Actions > New repository secret. Crea `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`.

Riceverai:
- **Riepilogo mattutino alle 7:30** (ora di Roma; GitHub può ritardare di qualche minuto, inviato una volta al giorno entro le 10:00).
- Avviso entro 30 minuti prima di ogni evento ad alto impatto.
- Setup che entrano in zona di ingresso (punteggio ≥ 6).
- News importanti.

## Fonti
Dukascopy (prezzi spot), Swissquote (bid/ask), OCSE e BIS (macro), CFTC (COT), Forex Factory (calendario), BullionVault (oro fisico), feed RSS pubblici, widget TradingView. Trading Economics e Finviz non offrono API gratuite: sono inclusi come link.

Le analisi sono ipotesi condizionate, non consigli di investimento.
