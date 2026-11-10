# @nor-data/kartverket-mcp

MCP server som wrapper Kartverket sine åpne API-er (via Geonorge): stedsnavn, adresser, høydedata, kommuneinfo, eiendom, grunnkretser og bygningspunkt. Ingen autentisering kreves.

## Verktøy

### `sok_grunnkrets` (v0.3.0)

Punkt (lat/lon) → statistisk grunnkrets via Kartverkets åpne WFS. Returnerer grunnkretsnummer (8 sifre), navn og kommunenummer. Nummeret brukes direkte som Region-filter i SSB-tabeller på grunnkretsnivå (04362 alder/kjønn, 04317 befolkning) for ekte nabolagsdemografi. Ved kretsgrense returneres flere treff med merknad.

### `sok_bygning` (v0.4.0)

Bygninger rundt et punkt fra Matrikkelen-Bygningspunkt (CC BY 4.0): bygningstype (NS-3457, dekodet), bygningsstatus (RA/IG = registrert byggeaktivitet), SEFRAK-flagg (alderssignal, hovedsakelig før 1900), kulturminne, avstand. Parametere: `lat`, `lon`, `radiusMeter` (default 50), `maksTreff` (default 20). NB: byggeår finnes ikke i det åpne datasettet (krever Matrikkel-avtale).

### `sok_stedsnavn`

Søk i Sentralt Stedsnavnregister.

**Parametere:**
- `sok` (påkrevd): søkestreng, f.eks. `"Bjorvika"`
- `knr` (valgfri): kommunenummer (4 sifre) for å begrense søket
- `treffPerSide` (valgfri, default 10): maks antall treff

**Returnerer:** skrivemåte, navneobjekttype, kommune, fylke, koordinater (WGS84 lat/lon), stedsnummer.

### `sok_adresse`

Søk i Matrikkelens adresseregister.

**Parametere:**
- `sok` (påkrevd): søkestreng, f.eks. `"Karl Johans gate 1 Oslo"`
- `kommunenummer` (valgfri): begrens til kommunenummer (4 sifre)
- `treffPerSide` (valgfri, default 10): maks antall treff

**Returnerer:** adressetekst, gate/nummer, postnummer/poststed, kommune, koordinater (WGS84 lat/lon), matrikkel-info.

### `hent_hoyde`

Hent terrenghøyde (meter over havet) for et koordinat. Bruker DTM 1m der det finnes, ellers grovere datasett.

**Parametere:**
- `lat` (påkrevd): breddegrad (WGS84)
- `lon` (påkrevd): lengdegrad (WGS84)

**Returnerer:** `hoydeMeter`, `datakilde` (f.eks. `dtm1`), `terreng`.

### `sok_kommune`

Slå opp kommune og fylke for et geografisk punkt.

**Parametere:**
- `lat` (påkrevd): breddegrad (WGS84)
- `lon` (påkrevd): lengdegrad (WGS84)

**Returnerer:** `kommune`, `kommunenummer`, `fylke`, `fylkesnummer`.

### `hent_kommune` (v0.5.0)

Hent én kommune fra kommunenummer.

**Parametere:**
- `kommunenummer` (påkrevd): 4 sifre, f.eks. `3911`

**Returnerer:** `funnet`, `kommune`, `kommunenavnNorsk`, `fylke`, `fylkesnummer`, `gyldigeNavn` (bokmål/nynorsk/samisk), `samiskForvaltningsomrade`, `representasjonspunkt` (lat/lon), `avgrensningsboks` (min/max lon/lat), `kilde`. Historisk/ukjent nummer gir `funnet: false` uten feil.

### `hent_kommune_omrade` (v0.5.0)

Hent kommunegrensen som GeoJSON (MultiPolygon, EPSG:4258).

**Parametere:**
- `kommunenummer` (påkrevd): 4 sifre
- `bareStatistikk` (valgfri): `true` gir bare antall polygoner/punkter

**Returnerer:** `geometriType`, `antallPolygoner`, `antallPunkter`, `omrade` (GeoJSON), `kilde`.

### `sok_kommuner` (v0.5.0)

Finn kommunenummer fra navn, eller list kommunene i et fylke.

**Parametere:**
- `sok` (valgfri): delstreng av kommunenavn
- `fylkesnummer` (valgfri): 2 sifre, f.eks. `39`

**Returnerer:** `antall`, `kommuner[]` med `kommunenummer`, `kommune`, `kommunenavnNorsk`; `fylke` når fylkesnummer er gitt.

### `sok_eiendom`

Slå opp matrikkeleiendom enten via et geografisk punkt eller via matrikkelnummer (knr/gnr/bnr).

**Parametere:**

*Punktsøk:*
- `lat`, `lon` (begge påkrevd for punktsøk)
- `radius` (valgfri): søkeradius i meter (1–1000)
- `treffPerSide` (valgfri, default 10)

*Matrikkeloppslag:*
- `knr` (kommunenummer, 4 sifre), `gnr` (gårdsnummer), `bnr` (bruksnummer) — alle påkrevd for matrikkelmodus
- `fnr` (festenummer), `snr` (seksjonsnummer) — valgfrie

Oppgi enten `lat+lon` eller `knr+gnr+bnr`.

**Returnerer:** matrikkelnummer, kommunenummer, lokalid, objekttype, representasjonspunkt (WGS84). I punktmodus også `meterFraPunkt` for hvert treff.

## Installasjon

### Via npx (anbefalt)

```bash
npx -y @nor-data/kartverket-mcp
```

### Global install

```bash
npm install -g @nor-data/kartverket-mcp
drist-kartverket-mcp
```

## Bruk i Claude Code

Legg til i `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "kartverket": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nor-data/kartverket-mcp"]
    }
  }
}
```

Eller via CLI:

```bash
claude mcp add kartverket -s user -- npx -y @nor-data/kartverket-mcp
```

## Eksempler

### Stedsnavn

```
sok_stedsnavn({ sok: "Galdhøpiggen" })
```

Returnerer Norges høyeste fjell (Lom kommune, koordinater 61.6363°N 8.3125°Ø).

```
sok_stedsnavn({ sok: "Bjorvika", knr: "0301" })
```

Finn Bjorvika i Oslo (kommunenummer 0301) i stedet for andre Bjorvika-er rundt om i landet.

### Adresser

```
sok_adresse({ sok: "Karl Johans gate 1 Oslo" })
```

Returnerer slott-adressen med postnummer 0154 og koordinater 59.9114°N 10.7494°Ø.

```
sok_adresse({ sok: "Storgata 1", kommunenummer: "5001" })
```

Storgata 1 i Trondheim spesifikt.

### Høyde

```
hent_hoyde({ lat: 61.6364, lon: 8.3127 })
```

Returnerer ~2465 m for Galdhøpiggen (DTM 1m).

### Kommune fra nummer og navn

```
sok_kommuner({ sok: "færder" })          // → 3911
hent_kommune({ kommunenummer: "3911" })
hent_kommune_omrade({ kommunenummer: "3911", bareStatistikk: true })
```

### Kommune fra koordinat

```
sok_kommune({ lat: 59.02682, lon: 10.52464 })
```

Færder fyr → Færder kommune (3911), Vestfold.

### Eiendom

```
sok_eiendom({ lat: 59.91, lon: 10.75 })
```

Returnerer de nærmeste matrikkeleiendommene rundt punktet, sortert etter avstand.

```
sok_eiendom({ knr: "0301", gnr: 207, bnr: 157 })
```

Slå opp en spesifikk eiendom og få representasjonspunktet.

## API-referanse

- Stedsnavn: <https://ws.geonorge.no/stedsnavn/v1/>
- Adresser: <https://ws.geonorge.no/adresser/v1/>
- Høydedata: <https://ws.geonorge.no/hoydedata/v1/>
- Kommuneinfo: <https://ws.geonorge.no/kommuneinfo/v1/>
- Eiendom: <https://ws.geonorge.no/eiendom/v1/>
- Bakgrunn: <https://kartverket.no/api-og-data>

Data er åpne under NLOD 2.0.

## Lokal utvikling

```bash
git clone <repo>
cd kartverket-mcp
npm install
npm run dev       # kjør direkte via tsx
npm run build     # kompiler til dist/
```

## Lisens

MIT
