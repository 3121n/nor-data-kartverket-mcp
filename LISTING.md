# Kartverket MCP server

**Norwegian addresses, properties, buildings and elevation — straight from Kartverket's open data, as MCP tools your AI agent can call. No API key.**

This Model Context Protocol (MCP) server wraps Kartverket's official open APIs (via Geonorge) and the Norwegian cadastre (Matrikkelen). It gives an AI agent first-class access to authoritative Norwegian geodata — addresses, place names, properties, buildings, municipalities, statistical zones and terrain elevation — without scraping, accounts or API keys.

## Why this server

- **Validate and geocode Norwegian addresses.** Turn free-text input like "Karl Johans gate 1 Oslo" into a canonical address with postal code, municipality and WGS84 coordinates — ideal for form validation, delivery/logistics apps and CRM cleanup.
- **Look up properties and the cadastre.** Resolve a coordinate or a `knr/gnr/bnr` matrikkel number to its official property record and representation point — useful for real-estate, due-diligence and public-sector workflows.
- **Answer location questions agents actually ask.** What municipality is this point in? What is the terrain elevation here? Which buildings (and any registered new-build activity) surround this spot? What statistical zone is this, so I can join it to SSB demographics?
- **Grounded, attributable answers.** Every result comes from Kartverket's authoritative registers, so an agent's geographic claims about Norway are backed by official open data rather than model memory.

## Tools

| Tool | What it returns |
| --- | --- |
| `sok_adresse` | Address search / geocoding against the cadastral address register: full address text, street, number, postal code, municipality and WGS84 lat/lon. |
| `sok_stedsnavn` | Place-name search in the Central Place Name Register (SSR): spelling, feature type, municipality, county and coordinates. |
| `sok_eiendom` | Cadastral property lookup by coordinate or by matrikkel number (`knr/gnr/bnr`, optionally `fnr/snr`): matrikkel number, municipality, local ID, object type and representation point. |
| `sok_bygning` | Buildings around a point (Matrikkelen building points): decoded building type (NS-3457), decoded status (RA/IG flags new-build activity), SEFRAK heritage flag, cultural-heritage flag and distance. |
| `sok_kommune` | Municipality and county for a coordinate: municipality name/number and county name/number. |
| `sok_grunnkrets` | Statistical zone (grunnkrets) for a coordinate: 8-digit zone number, name and municipality — joinable directly to SSB tables for neighbourhood demographics. |
| `hent_hoyde` | Terrain elevation (metres above sea level) for a coordinate, using the 1 m DTM where available, plus the data source. |

> Note: tool names and parameters are in Norwegian (matching Kartverket's domain terms); tool descriptions guide the agent on usage.

## Install

Run directly with `npx` — no install, no API key:

```bash
npx -y @nor-data/kartverket-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kartverket": {
      "command": "npx",
      "args": ["-y", "@nor-data/kartverket-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add kartverket -s user -- npx -y @nor-data/kartverket-mcp
```

### Cursor

Add to `~/.cursor/mcp.json` (or the project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "kartverket": {
      "command": "npx",
      "args": ["-y", "@nor-data/kartverket-mcp"]
    }
  }
}
```

## Data source & attribution

All data is supplied by **Kartverket** (the Norwegian Mapping Authority) through its open APIs and the **Geonorge** platform. Datasets are open and require no authentication:

- Core APIs (place names, addresses, elevation, municipality info, property) are published under **NLOD 2.0** (Norwegian Licence for Open Government Data).
- The Matrikkelen building-point dataset used by `sok_bygning` is published under **CC BY 4.0**.

When you redistribute or display results, attribute the source — e.g. "Contains data under NLOD 2.0 / CC BY 4.0 from Kartverket (Geonorge)." See <https://kartverket.no/api-og-data> for the authoritative terms.

This server is an independent open-source wrapper and is not affiliated with or endorsed by Kartverket.

## Pricing (Apify)

<!-- PLACEHOLDER: Apify pay-per-event pricing.
     Configured in .actor/pay_per_event.json:
       - actor-start: $0.001 (once per session)
       - tool-call:   $0.002 (per tool call)
     Finalise copy and confirm rates before publishing to the Apify Store. -->

When run as an Apify Actor, this server uses pay-per-event pricing: a small flat fee per session start plus a per-tool-call fee. See the Apify Store listing for current rates.
