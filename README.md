# vitamind-mcp

Connect your AI assistant to [Vitamin D Explorer](https://getvitamind.app) — so it can
answer, for your actual location and skin type, whether the sun can make vitamin D right
now, how long you'd need, and which months of the year it's possible at all.

Generic advice says "get 15 minutes of sun". That answer is wrong most of the time: skin
type I in London and skin type V in Madrid need completely different exposure, and above
about 40° latitude there are months where synthesis is physically impossible no matter how
long you stay out.

## Try it

> "I'm in Vilnius, skin type II. Can I make vitamin D today?"
>
> "Which months of the year can I get vitamin D in London?"
>
> "I was out 25 minutes at noon in Madrid, arms and legs bare — how much did I make?"
>
> "When's golden hour in Lisbon on Friday?"

## Install

Most clients can connect to the hosted server directly, with **no install at all** — see
[getvitamind.app/connect](https://getvitamind.app/connect) for per-client steps. Use this
package when your client only launches local commands.

```json
{
  "mcpServers": {
    "vitamind": {
      "command": "npx",
      "args": ["-y", "vitamind-mcp"]
    }
  }
}
```

That's the whole configuration. No API key, no account.

## Tools

Six public tools, no account needed:

| Tool | Answers |
|---|---|
| `search_city` | Find a city and its coordinates, in any of the app's six languages |
| `get_sun_times` | Sunrise, sunset, solar noon, civil dawn/dusk, both golden hours, day length |
| `get_vitamin_d_window` | The synthesis window for one day: minutes needed, best hour, UV peak |
| `get_vitamin_d_year` | The whole year in one call: which months work, which don't |
| `get_current_status` | Whether *right now* is a good moment, from live UV and cloud data |
| `estimate_sun_session` | What a session produced — IU made, and minutes until burning |

Four more read your saved profile, favourite cities and sun history if you sign in
(`get_my_profile`, `get_my_cities`, `get_my_history`, `log_sun_session`). Those need
OAuth, which this bridge does not implement — connect the account endpoint directly, or:

```bash
npx mcp-remote https://getvitamind.app/api/mcp-auth/mcp
```

## What's behind the numbers

Not a lookup table. Every answer is computed from:

- **Solar geometry** — NOAA declination and elevation formulas.
- **UV model** — Madronich (2007) clear-sky UVI with van Heuklon ozone by latitude,
  longitude and season, plus an altitude correction (~8% per km — enough to change which
  months work for a city like Bogotá).
- **Vitamin D synthesis** — Holick & Dowdy (2010), with MED by Fitzpatrick skin type
  (I-VI) and the Holick (1989) age factor. Sessions saturate: past roughly ⅓ MED you gain
  little and burn risk rises, and the tools say so.
- **Live weather** — Open-Meteo UV index and cloud cover.

Threshold for any synthesis at all: **UV index ≥ 3**. Below that the answer is honestly
"not today, consider supplementing" rather than a smaller number.

## Configuration

| | |
|---|---|
| `--url <endpoint>` | Endpoint to bridge to. Default `https://getvitamind.app/api/mcp/mcp` |
| `VITAMIND_MCP_URL` | Same, as an environment variable |

## How it works

A stdio↔HTTP relay, and nothing more. It forwards JSON-RPC messages verbatim between your
client and the hosted server, so new tools appear without a release here. **All the vitamin
D logic lives in the hosted server** — deliberately, since a second copy of the model in
this package would drift from the app that people actually use.

## Not medical advice

Estimates for healthy skin under clear-sky or forecast conditions. They ignore aerosols,
ground reflectance, sunscreen and individual variation, and they are not a substitute for
advice from a professional. Do not use them to plan an intentional burn.

## Links

- App: [getvitamind.app](https://getvitamind.app)
- Setup guide: [getvitamind.app/connect](https://getvitamind.app/connect)
- Main repository: [JaviMaligno/vitamind](https://github.com/JaviMaligno/vitamind)

MIT
