// E2E-test for hent_kommune / hent_kommune_omrade / sok_kommuner (v0.5.0): live mot ws.geonorge.no
import { spawn } from "node:child_process";

const proc = spawn("node", ["dist/index.js"], { cwd: import.meta.dirname, stdio: ["pipe", "pipe", "inherit"] });
let buf = "";
const pending = new Map();
proc.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 45000);
  });
}
async function call(name, args) {
  const r = await rpc("tools/call", { params: undefined, name, arguments: args });
  if (r.error) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
  const text = r.result.content[0].text;
  return { isError: r.result.isError === true, json: JSON.parse(text), bytes: text.length };
}
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
console.log("INIT OK:", init.result.serverInfo.name, init.result.serverInfo.version);
proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

const tools = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
check(["hent_kommune", "hent_kommune_omrade", "sok_kommuner"].every((n) => tools.includes(n)), `tools/list har de tre nye (${tools.length} verktøy totalt)`);

// 1. Gyldig kommune
const f = await call("hent_kommune", { kommunenummer: "3911" });
check(!f.isError && f.json.funnet === true && f.json.kommune === "Færder" && f.json.fylkesnummer === "39", `hent_kommune 3911 → ${f.json.kommune}, ${f.json.fylke} (${f.json.fylkesnummer})`);
check(typeof f.json.representasjonspunkt?.lat === "number" && f.json.representasjonspunkt.lat > 58 && f.json.representasjonspunkt.lat < 60, `representasjonspunkt lat/lon: ${JSON.stringify(f.json.representasjonspunkt)}`);
check(f.json.avgrensningsboks && f.json.avgrensningsboks.minLon < f.json.avgrensningsboks.maxLon, `avgrensningsboks ${JSON.stringify(f.json.avgrensningsboks)}`);

// 2. Historisk kommunenummer (Færder før 2024) → funnet:false, ikke feil
const h = await call("hent_kommune", { kommunenummer: "3811" });
check(!h.isError && h.json.funnet === false, `hent_kommune 3811 (historisk) → funnet=false, melding: ${h.json.melding}`);

// 3. Ugyldig format → zod-feil fra serveren
const bad = await rpc("tools/call", { name: "hent_kommune", arguments: { kommunenummer: "39" } });
check(bad.error !== undefined || bad.result?.isError === true, `hent_kommune '39' avvises (valideringsfeil)`);

// 4. Område
const o = await call("hent_kommune_omrade", { kommunenummer: "3911" });
check(!o.isError && o.json.geometriType === "MultiPolygon" && o.json.antallPunkter > 100 && o.json.omrade?.coordinates, `hent_kommune_omrade 3911 → ${o.json.geometriType}, ${o.json.antallPolygoner} polygoner, ${o.json.antallPunkter} punkter, ${o.bytes} B`);
const os = await call("hent_kommune_omrade", { kommunenummer: "3911", bareStatistikk: true });
check(!os.isError && os.json.omrade === undefined && os.json.antallPunkter === o.json.antallPunkter, `bareStatistikk utelater geometri (${os.bytes} B)`);

// 5. Navnesøk og fylkesliste
const n = await call("sok_kommuner", { sok: "færder" });
check(!n.isError && n.json.antall === 1 && n.json.kommuner[0].kommunenummer === "3911", `sok_kommuner 'færder' → ${JSON.stringify(n.json.kommuner)}`);
const fy = await call("sok_kommuner", { fylkesnummer: "39" });
check(!fy.isError && fy.json.antall === 6 && fy.json.fylke?.fylkesnavn === "Vestfold", `sok_kommuner fylke 39 → ${fy.json.antall} kommuner i ${fy.json.fylke?.fylkesnavn}`);
const alle = await call("sok_kommuner", {});
check(!alle.isError && alle.json.antall >= 350 && alle.json.antall <= 360, `sok_kommuner uten filter → ${alle.json.antall} kommuner`);

// 6. Eksisterende verktøy fortsatt grønt
const k = await call("sok_kommune", { lat: 59.02682, lon: 10.52464 });
check(!k.isError && k.json.kommunenummer === "3911", `sok_kommune (punkt) uendret → ${k.json.kommune}`);

proc.kill();
console.log(process.exitCode ? "\nNOEN TESTER FEILET" : "\nALLE TESTER GRØNNE");
