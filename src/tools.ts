import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const STEDSNAVN_URL = "https://ws.geonorge.no/stedsnavn/v1/navn";
const ADRESSER_URL = "https://ws.geonorge.no/adresser/v1/sok";
const HOYDE_URL = "https://ws.geonorge.no/hoydedata/v1/punkt";
const KOMMUNEINFO_PUNKT_URL = "https://ws.geonorge.no/kommuneinfo/v1/punkt";
const EIENDOM_PUNKT_URL = "https://ws.geonorge.no/eiendom/v1/punkt";
const EIENDOM_GEOKODING_URL = "https://ws.geonorge.no/eiendom/v1/geokoding";

async function fetchJson(url: URL): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Geonorge ${res.status} ${res.statusText} for ${url.pathname}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  return res.json();
}

type StedsnavnTreff = {
  skrivemåte?: string;
  navneobjekttype?: string;
  navnestatus?: string;
  skrivemåtestatus?: string;
  språk?: string;
  stedstatus?: string;
  stedsnummer?: number;
  kommuner?: Array<{ kommunenavn?: string; kommunenummer?: string }>;
  fylker?: Array<{ fylkesnavn?: string; fylkesnummer?: string }>;
  representasjonspunkt?: { koordsys?: number; nord?: number; øst?: number };
};

type AdresseTreff = {
  adressetekst?: string;
  adressenavn?: string;
  nummer?: number;
  bokstav?: string;
  adressekode?: number;
  kommunenavn?: string;
  kommunenummer?: string;
  postnummer?: string;
  poststed?: string;
  objtype?: string;
  gardsnummer?: number;
  bruksnummer?: number;
  representasjonspunkt?: { epsg?: string; lat?: number; lon?: number };
  oppdateringsdato?: string;
};

const GRUNNKRETS_WFS_URL = "https://wfs.geonorge.no/skwms1/wfs.grunnkretser";
const BYGNING_WFS_URL = "https://wfs.geonorge.no/skwms1/wfs.matrikkelen-bygningspunkt";

// NS-3457 bygningstype (vanligste koder) — fallback: rå kode + henvisning til standarden
const BYGNINGSTYPE: Record<string, string> = {
  "111": "Enebolig",
  "112": "Enebolig med hybelleilighet",
  "113": "Våningshus",
  "121": "Tomannsbolig, vertikaldelt",
  "122": "Tomannsbolig, horisontaldelt",
  "131": "Rekkehus",
  "133": "Kjedehus",
  "135": "Terrassehus",
  "136": "Andre småhus",
  "141": "Store frittliggende boligbygg på 2 etasjer",
  "142": "Store frittliggende boligbygg på 3 og 4 etasjer",
  "143": "Store frittliggende boligbygg på 5 etasjer eller over",
  "144": "Store sammenbygde boligbygg på 2 etasjer",
  "145": "Store sammenbygde boligbygg på 3 og 4 etasjer",
  "146": "Store sammenbygde boligbygg på 5 etasjer og over",
  "151": "Bo- og servicesenter",
  "152": "Studenthjem/studentboliger",
  "161": "Fritidsbygg (hytter, sommerhus o.l.)",
  "181": "Garasje, uthus, anneks til bolig",
  "182": "Garasje, uthus, anneks til fritidsbolig",
  "199": "Annen boligbygning",
  "211": "Fabrikkbygning",
  "212": "Verkstedbygning",
  "219": "Annen industribygning",
  "231": "Lagerhall",
  "239": "Annen lagerbygning",
  "311": "Kontor- og administrasjonsbygning, rådhus",
  "319": "Annen kontorbygning",
  "321": "Kjøpesenter, varehus",
  "322": "Butikkbygning",
  "330": "Hotellbygning",
  "411": "Ekspedisjonsbygning, flyterminal, kontrolltårn",
  "511": "Skolebygning",
  "612": "Sykehus",
  "651": "Barnehage",
  "671": "Kirke, kapell",
  "830": "Fjøs, husdyrbruk",
};

const BYGNINGSSTATUS: Record<string, string> = {
  RA: "Rammetillatelse (planlagt bygg — byggeaktivitet)",
  IG: "Igangsettingstillatelse (under oppføring — byggeaktivitet)",
  MB: "Midlertidig brukstillatelse",
  FA: "Ferdigattest",
  TB: "Tatt i bruk",
  GR: "Godkjent revet/brent",
  IP: "Ikke pliktig registrert",
  BA: "Bygging avlyst",
  BF: "Bygning flyttet",
};

/**
 * Registers all Kartverket MCP tools on the given server.
 *
 * `onToolCall` is invoked (and awaited) at the start of every tool call before
 * any network request. It lets a host (e.g. the Apify standby wrapper) charge a
 * pay-per-event fee. The stdio entrypoint passes no callback, so it is a no-op.
 */
export function registerTools(s: McpServer, onToolCall?: (toolName: string) => void | Promise<void>): void {
  const charge = async (toolName: string) => {
    if (onToolCall) await onToolCall(toolName);
  };

  s.tool(
    "sok_stedsnavn",
    "Søk i Sentralt Stedsnavnregister (Kartverket). Returnerer treff med skrivemåte, kommune, fylke og koordinater (WGS84 lat/lon).",
    {
      sok: z.string().min(1).describe("Søkestreng (f.eks. 'Bjorvika' eller 'Galdhøpiggen')"),
      knr: z.string().regex(/^\d{4}$/).optional().describe("Kommunenummer (4 sifre) for å begrense søket til én kommune"),
      treffPerSide: z.number().int().min(1).max(50).optional().describe("Maks antall treff (default 10)"),
    },
    async ({ sok, knr, treffPerSide = 10 }) => {
      await charge("sok_stedsnavn");
      const url = new URL(STEDSNAVN_URL);
      url.searchParams.set("sok", sok);
      url.searchParams.set("treffPerSide", String(treffPerSide));
      url.searchParams.set("utkoordsys", "4326");
      if (knr) url.searchParams.set("knr", knr);
      const data = (await fetchJson(url)) as { metadata?: Record<string, unknown>; navn?: StedsnavnTreff[] };
      const treff = (data.navn ?? []).map((n) => ({
        skrivemåte: n.skrivemåte,
        navneobjekttype: n.navneobjekttype,
        kommune: n.kommuner?.[0]?.kommunenavn,
        kommunenummer: n.kommuner?.[0]?.kommunenummer,
        fylke: n.fylker?.[0]?.fylkesnavn,
        lat: n.representasjonspunkt?.nord,
        lon: n.representasjonspunkt?.øst,
        stedsnummer: n.stedsnummer,
        språk: n.språk,
        navnestatus: n.navnestatus,
        stedstatus: n.stedstatus,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { totalt: data.metadata?.totaltAntallTreff ?? treff.length, viser: treff.length, treff },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  s.tool(
    "sok_adresse",
    "Søk i Matrikkelens adresseregister (Kartverket). Returnerer treff med fullstendig adresse, kommune, postnummer og koordinater (ETRS89/WGS84 lat/lon).",
    {
      sok: z.string().min(1).describe("Søkestreng (f.eks. 'Karl Johans gate 1 Oslo')"),
      kommunenummer: z.string().regex(/^\d{4}$/).optional().describe("Begrens til kommunenummer (4 sifre)"),
      treffPerSide: z.number().int().min(1).max(50).optional().describe("Maks antall treff (default 10)"),
    },
    async ({ sok, kommunenummer, treffPerSide = 10 }) => {
      await charge("sok_adresse");
      const url = new URL(ADRESSER_URL);
      url.searchParams.set("sok", sok);
      url.searchParams.set("treffPerSide", String(treffPerSide));
      url.searchParams.set("utkoordsys", "4326");
      if (kommunenummer) url.searchParams.set("kommunenummer", kommunenummer);
      const data = (await fetchJson(url)) as { metadata?: Record<string, unknown>; adresser?: AdresseTreff[] };
      const treff = (data.adresser ?? []).map((a) => ({
        adressetekst: a.adressetekst,
        adressenavn: a.adressenavn,
        nummer: a.nummer,
        bokstav: a.bokstav || undefined,
        postnummer: a.postnummer,
        poststed: a.poststed,
        kommune: a.kommunenavn,
        kommunenummer: a.kommunenummer,
        lat: a.representasjonspunkt?.lat,
        lon: a.representasjonspunkt?.lon,
        objekttype: a.objtype,
        gardsnummer: a.gardsnummer,
        bruksnummer: a.bruksnummer,
        oppdateringsdato: a.oppdateringsdato,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { totalt: data.metadata?.totaltAntallTreff ?? treff.length, viser: treff.length, treff },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  s.tool(
    "hent_hoyde",
    "Hent terrenghøyde (meter over havet) for et koordinat fra Kartverkets høydedata-API. Bruker DTM 1m der det finnes.",
    {
      lat: z.number().min(-90).max(90).describe("Breddegrad (WGS84, f.eks. 59.91 for Oslo)"),
      lon: z.number().min(-180).max(180).describe("Lengdegrad (WGS84, f.eks. 10.75 for Oslo)"),
    },
    async ({ lat, lon }) => {
      await charge("hent_hoyde");
      const url = new URL(HOYDE_URL);
      url.searchParams.set("koordsys", "4326");
      url.searchParams.set("nord", String(lat));
      url.searchParams.set("ost", String(lon));
      const data = (await fetchJson(url)) as {
        punkter?: Array<{ z?: number; datakilde?: string; terreng?: string; x?: number; y?: number }>;
      };
      const p = data.punkter?.[0];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              p
                ? { lat, lon, hoydeMeter: p.z, datakilde: p.datakilde, terreng: p.terreng }
                : { lat, lon, hoydeMeter: null, feil: "Ingen høydeverdi for koordinatet" },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  s.tool(
    "sok_kommune",
    "Slå opp kommune og fylke for et geografisk punkt (WGS84) via Kartverkets kommuneinfo-API.",
    {
      lat: z.number().min(-90).max(90).describe("Breddegrad (WGS84)"),
      lon: z.number().min(-180).max(180).describe("Lengdegrad (WGS84)"),
    },
    async ({ lat, lon }) => {
      await charge("sok_kommune");
      const url = new URL(KOMMUNEINFO_PUNKT_URL);
      url.searchParams.set("koordsys", "4326");
      url.searchParams.set("nord", String(lat));
      url.searchParams.set("ost", String(lon));
      const data = (await fetchJson(url)) as {
        kommunenavn?: string;
        kommunenummer?: string;
        fylkesnavn?: string;
        fylkesnummer?: string;
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                lat,
                lon,
                kommune: data.kommunenavn,
                kommunenummer: data.kommunenummer,
                fylke: data.fylkesnavn,
                fylkesnummer: data.fylkesnummer,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  s.tool(
    "sok_eiendom",
    "Slå opp matrikkeleiendom enten via et geografisk punkt (lat/lon) eller via matrikkelnummer (knr/gnr/bnr, evt. festenr/seksjonsnr). Returnerer matrikkelnummer, lokalid og representasjonspunkt (WGS84).",
    {
      lat: z.number().min(-90).max(90).optional().describe("Breddegrad (WGS84). Brukes med lon for punktsøk."),
      lon: z.number().min(-180).max(180).optional().describe("Lengdegrad (WGS84). Brukes med lat for punktsøk."),
      radius: z.number().int().min(1).max(1000).optional().describe("Søkeradius i meter for punktsøk (default 0/eksakt)"),
      knr: z.string().regex(/^\d{4}$/).optional().describe("Kommunenummer (4 sifre) for matrikkeloppslag"),
      gnr: z.number().int().min(1).optional().describe("Gårdsnummer for matrikkeloppslag"),
      bnr: z.number().int().min(0).optional().describe("Bruksnummer for matrikkeloppslag"),
      fnr: z.number().int().min(0).optional().describe("Festenummer (valgfritt)"),
      snr: z.number().int().min(0).optional().describe("Seksjonsnummer (valgfritt)"),
      treffPerSide: z.number().int().min(1).max(50).optional().describe("Maks treff i punktsøk (default 10)"),
    },
    async ({ lat, lon, radius, knr, gnr, bnr, fnr, snr, treffPerSide = 10 }) => {
      await charge("sok_eiendom");
      const harPunkt = lat !== undefined && lon !== undefined;
      const harMatrikkel = knr !== undefined && gnr !== undefined && bnr !== undefined;
      if (!harPunkt && !harMatrikkel) {
        throw new Error("Oppgi enten lat+lon (punktsøk) eller knr+gnr+bnr (matrikkeloppslag)");
      }
      if (harPunkt) {
        const url = new URL(EIENDOM_PUNKT_URL);
        url.searchParams.set("nord", String(lat));
        url.searchParams.set("ost", String(lon));
        url.searchParams.set("koordsys", "4326");
        url.searchParams.set("utkoordsys", "4326");
        url.searchParams.set("treffPerSide", String(treffPerSide));
        if (radius !== undefined) url.searchParams.set("radius", String(radius));
        const data = (await fetchJson(url)) as {
          metadata?: Record<string, unknown>;
          eiendom?: Array<{
            matrikkelnummertekst?: string;
            kommunenummer?: string;
            gardsnummer?: number;
            bruksnummer?: number;
            festenummer?: number;
            seksjonsnummer?: number;
            lokalid?: number;
            objekttype?: string;
            meterFraPunkt?: number;
            oppdateringsdato?: string;
            representasjonspunkt?: { koordsys?: number; nord?: number; øst?: number };
          }>;
        };
        const treff = (data.eiendom ?? []).map((e) => ({
          matrikkelnummer: e.matrikkelnummertekst,
          kommunenummer: e.kommunenummer,
          gardsnummer: e.gardsnummer,
          bruksnummer: e.bruksnummer,
          festenummer: e.festenummer || undefined,
          seksjonsnummer: e.seksjonsnummer || undefined,
          lokalid: e.lokalid,
          objekttype: e.objekttype,
          meterFraPunkt: e.meterFraPunkt,
          lat: e.representasjonspunkt?.nord,
          lon: e.representasjonspunkt?.øst,
          oppdateringsdato: e.oppdateringsdato,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ modus: "punkt", viser: treff.length, treff }, null, 2),
            },
          ],
        };
      }
      const url = new URL(EIENDOM_GEOKODING_URL);
      url.searchParams.set("kommunenummer", knr!);
      url.searchParams.set("gardsnummer", String(gnr));
      url.searchParams.set("bruksnummer", String(bnr));
      if (fnr !== undefined) url.searchParams.set("festenummer", String(fnr));
      if (snr !== undefined) url.searchParams.set("seksjonsnummer", String(snr));
      url.searchParams.set("utkoordsys", "4326");
      const data = (await fetchJson(url)) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            matrikkelnummertekst?: string;
            kommunenummer?: string;
            gardsnummer?: number;
            bruksnummer?: number;
            festenummer?: number;
            seksjonsnummer?: number;
            lokalid?: number;
            objekttype?: string;
            oppdateringsdato?: string;
          };
        }>;
      };
      const treff = (data.features ?? []).map((f) => ({
        matrikkelnummer: f.properties?.matrikkelnummertekst,
        kommunenummer: f.properties?.kommunenummer,
        gardsnummer: f.properties?.gardsnummer,
        bruksnummer: f.properties?.bruksnummer,
        festenummer: f.properties?.festenummer || undefined,
        seksjonsnummer: f.properties?.seksjonsnummer || undefined,
        lokalid: f.properties?.lokalid,
        objekttype: f.properties?.objekttype,
        lon: f.geometry?.coordinates?.[0],
        lat: f.geometry?.coordinates?.[1],
        oppdateringsdato: f.properties?.oppdateringsdato,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ modus: "matrikkel", viser: treff.length, treff }, null, 2),
          },
        ],
      };
    },
  );

  s.tool(
    "sok_grunnkrets",
    "Slå opp statistisk grunnkrets (SSB/Kartverket-inndeling) for et geografisk punkt (WGS84). Returnerer grunnkretsnummer (8 sifre), grunnkretsnavn og kommunenummer. Grunnkretsnummeret kan brukes direkte som Region-filter i SSB-tabeller på grunnkretsnivå (f.eks. 04362 alders-/kjønnsfordeling, 04317 befolkning) for ekte nabolagsdemografi. Kilde: Kartverket WFS (åpen, avtale-fri).",
    {
      lat: z.number().min(57).max(72).describe("Breddegrad (WGS84, f.eks. 59.93 for Oslo)"),
      lon: z.number().min(4).max(32).describe("Lengdegrad (WGS84, f.eks. 10.76 for Oslo)"),
    },
    async ({ lat, lon }) => {
      await charge("sok_grunnkrets");
      const e = 0.0001; // ~11 m N-S; lite nok til at punktet nesten alltid gir én krets
      const bbox = `${lat - e},${lon - e},${lat + e},${lon + e},urn:ogc:def:crs:EPSG::4258`;
      const url = new URL(GRUNNKRETS_WFS_URL);
      url.searchParams.set("service", "WFS");
      url.searchParams.set("version", "2.0.0");
      url.searchParams.set("request", "GetFeature");
      url.searchParams.set("typenames", "app:Grunnkrets");
      url.searchParams.set("bbox", bbox);
      url.searchParams.set("count", "5");
      const res = await fetch(url, { headers: { Accept: "application/xml" } });
      if (!res.ok) {
        throw new Error(`Geonorge WFS ${res.status} ${res.statusText} for grunnkrets-oppslag`);
      }
      const xml = await res.text();
      // GML-parsing med regex per wfs:member — feltene er flate tekstelementer
      const members = xml.split("<wfs:member>").slice(1);
      const treff = members.map((m) => {
        const g = (tag: string) => {
          const match = m.match(new RegExp(`<app:${tag}>([^<]+)</app:${tag}>`));
          return match ? match[1] : undefined;
        };
        return {
          grunnkretsnummer: g("grunnkretsnummer"),
          grunnkretsnavn: g("grunnkretsnavn"),
          kommunenummer: g("kommunenummer"),
          gyldigFra: g("gyldigFra"),
          oppdateringsdato: g("oppdateringsdato")?.slice(0, 10),
          opphav: g("opphav"),
        };
      }).filter((t) => t.grunnkretsnummer);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                lat,
                lon,
                viser: treff.length,
                treff,
                merknad:
                  treff.length === 0
                    ? "Ingen grunnkrets funnet — punktet kan ligge i sjø/utenfor dekning."
                    : treff.length > 1
                      ? "Flere kretser returnert — punktet ligger nær en kretsgrense; første treff er vanligvis riktig, men verifiser ved behov."
                      : undefined,
                ssbKobling: "Bruk grunnkretsnummer som Region-filter i SSB-tabell 04362 (alder/kjønn) eller 04317 (befolkning) for nabolagsdemografi.",
                kilde: { navn: "Kartverket — Statistiske enheter grunnkretser", tjeneste: GRUNNKRETS_WFS_URL, lisens: "Åpne data, punktoppslag uten avtale" },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  s.tool(
    "sok_bygning",
    "Finn bygninger (Matrikkelen-Bygningspunkt, Kartverket) rundt et koordinat (WGS84). Returnerer bygningstype (NS-3457, dekodet), bygningsstatus (dekodet — RA/IG indikerer byggeaktivitet), SEFRAK-minne (proxy for eldre bygg, hovedsakelig før 1900), kulturminne-flagg og avstand fra punktet. NB: byggeår finnes IKKE i det åpne datasettet (krever full Matrikkel-avtale) — SEFRAK-flagget er nærmeste åpne alderssignal. Kilde: Kartverket WFS, CC BY 4.0, avtale-fri.",
    {
      lat: z.number().min(57).max(72).describe("Breddegrad (WGS84)"),
      lon: z.number().min(4).max(32).describe("Lengdegrad (WGS84)"),
      radiusMeter: z.number().int().min(10).max(500).optional().describe("Søkeradius i meter (default 50; bruk 100-200 for nabolags-byggeaktivitet)"),
      maksTreff: z.number().int().min(1).max(50).optional().describe("Maks antall bygninger (default 20)"),
    },
    async ({ lat, lon, radiusMeter = 50, maksTreff = 20 }) => {
      await charge("sok_bygning");
      const dLat = radiusMeter / 111320;
      const dLon = radiusMeter / (111320 * Math.cos((lat * Math.PI) / 180));
      const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon},urn:ogc:def:crs:EPSG::4258`;
      const url = new URL(BYGNING_WFS_URL);
      url.searchParams.set("service", "WFS");
      url.searchParams.set("version", "2.0.0");
      url.searchParams.set("request", "GetFeature");
      url.searchParams.set("typenames", "app:Bygning");
      url.searchParams.set("bbox", bbox);
      url.searchParams.set("count", String(maksTreff));
      const res = await fetch(url, { headers: { Accept: "application/xml" } });
      if (!res.ok) {
        throw new Error(`Geonorge WFS ${res.status} ${res.statusText} for bygningspunkt-oppslag`);
      }
      const xml = await res.text();
      const members = xml.split("<wfs:member>").slice(1);
      const treff = members
        .map((m) => {
          const g = (tag: string) => {
            const match = m.match(new RegExp(`<app:${tag}>([^<]+)</app:${tag}>`));
            return match ? match[1] : undefined;
          };
          const pos = m.match(/<gml:pos>([\d.]+) ([\d.]+)<\/gml:pos>/);
          const bLat = pos ? Number(pos[1]) : undefined;
          const bLon = pos ? Number(pos[2]) : undefined;
          let avstandMeter: number | undefined;
          if (bLat !== undefined && bLon !== undefined) {
            const dy = (bLat - lat) * 111320;
            const dx = (bLon - lon) * 111320 * Math.cos((lat * Math.PI) / 180);
            avstandMeter = Math.round(Math.sqrt(dx * dx + dy * dy));
          }
          const status = g("bygningsstatus");
          const type = g("bygningstype");
          return {
            bygningsnummer: g("bygningsnummer"),
            bygningstype: { kode: type, betydning: type ? BYGNINGSTYPE[type] ?? "se NS-3457-standarden" : undefined },
            bygningsstatus: { kode: status, betydning: status ? BYGNINGSSTATUS[status] ?? status : undefined },
            byggeaktivitet: status === "RA" || status === "IG",
            sefrakMinne: g("harSefrakminne") === "true",
            kulturminne: g("harKulturminne") === "true",
            naringsgruppe: g("naringsgruppe"),
            stedfestingVerifisert: g("stedfestingVerifisert") === "true",
            avstandMeter,
            lat: bLat,
            lon: bLon,
            oppdatert: g("oppdateringsdato")?.slice(0, 10),
          };
        })
        .filter((t) => t.bygningsnummer)
        .sort((a, b) => (a.avstandMeter ?? 9999) - (b.avstandMeter ?? 9999));
      const aktive = treff.filter((t) => t.byggeaktivitet);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                lat,
                lon,
                radiusMeter,
                viser: treff.length,
                byggeaktivitetIOmradet: aktive.length > 0
                  ? `${aktive.length} bygg med ramme-/igangsettingstillatelse innen ${radiusMeter} m — registrert byggeaktivitet`
                  : `Ingen bygg med ramme-/igangsettingstillatelse innen ${radiusMeter} m`,
                treff,
                merknader: [
                  "Byggeår finnes ikke i det åpne bygningspunkt-datasettet (krever Matrikkel-avtale). SEFRAK-flagget markerer bygg fra SEFRAK-registeret (hovedsakelig oppført før 1900) og er nærmeste åpne alderssignal.",
                  "Byggeaktivitet-flagget (RA/IG) dekker NYBYGG-tillatelser registrert som bygningspunkt — rehabilitering/ombygging av eksisterende bygg fanges ikke.",
                ],
                kilde: { navn: "Kartverket — Matrikkelen-Bygningspunkt", tjeneste: BYGNING_WFS_URL, lisens: "CC BY 4.0, punktoppslag uten avtale" },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
