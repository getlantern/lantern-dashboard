import { useState, useEffect, useMemo, useCallback, memo, type CSSProperties } from "react";
import type {
  DashboardCountry,
  DashboardASN,
  DashboardArmEntry,
  DashboardDataCenter,
} from "../api/client";
import { fetchASNs, fetchASNArms } from "../api/client";

interface BanditArmsOverviewProps {
  countries: DashboardCountry[];
  dataCenters?: DashboardDataCenter[];
  isLive?: boolean;
}

// Lazy-loaded ASN → org name database (121K entries, ~1.5MB gzipped)
let asnNamesDB: Record<string, string> | null = null;
let asnNamesLoading = false;

function useASNNames() {
  const [loaded, setLoaded] = useState(asnNamesDB !== null);
  useEffect(() => {
    if (asnNamesDB || asnNamesLoading) return;
    asnNamesLoading = true;
    fetch("/asn-names.json")
      .then((r) => r.json())
      .then((data) => { asnNamesDB = data; setLoaded(true); })
      .catch(() => { asnNamesLoading = false; });
  }, []);
  return loaded ? asnNamesDB : null;
}

const COUNTRY_NAMES: Record<string, string> = {
  IR: "Iran", CN: "China", RU: "Russia", MM: "Myanmar", BY: "Belarus",
  TM: "Turkmenistan", VN: "Vietnam", CU: "Cuba", SA: "Saudi Arabia",
  PK: "Pakistan", UZ: "Uzbekistan", TH: "Thailand", AE: "UAE",
  IN: "India", BD: "Bangladesh", EG: "Egypt", TR: "Turkey",
  VE: "Venezuela", KZ: "Kazakhstan", US: "United States", GB: "United Kingdom",
  FR: "France", DE: "Germany", JP: "Japan", KR: "South Korea",
  AU: "Australia", CA: "Canada", SE: "Sweden", CH: "Switzerland",
  NL: "Netherlands", SG: "Singapore", BR: "Brazil", MX: "Mexico",
  ID: "Indonesia", NG: "Nigeria", KE: "Kenya", ZA: "South Africa",
  UA: "Ukraine", PL: "Poland", RO: "Romania", IQ: "Iraq",
  AF: "Afghanistan", MY: "Malaysia", PH: "Philippines", ET: "Ethiopia",
  TZ: "Tanzania",
};

const COUNTRY_NAMES_EXTRA: Record<string, string> = {
  LK: "Sri Lanka", MM: "Myanmar", BD: "Bangladesh", NP: "Nepal",
  KH: "Cambodia", LA: "Laos", TJ: "Tajikistan", KG: "Kyrgyzstan",
  AZ: "Azerbaijan", GE: "Georgia", AM: "Armenia", SD: "Sudan",
  SS: "South Sudan", ER: "Eritrea", DJ: "Djibouti", SO: "Somalia",
  YE: "Yemen", SY: "Syria", LY: "Libya", TD: "Chad", CM: "Cameroon",
  CD: "DR Congo", CG: "Congo", ZW: "Zimbabwe", MZ: "Mozambique",
  HN: "Honduras", NI: "Nicaragua", HT: "Haiti", BO: "Bolivia",
  EC: "Ecuador", PE: "Peru", CO: "Colombia", CL: "Chile", AR: "Argentina",
  UY: "Uruguay", PY: "Paraguay", GH: "Ghana", CI: "Ivory Coast",
  SN: "Senegal", ML: "Mali", BF: "Burkina Faso", NE: "Niger",
  MG: "Madagascar", RW: "Rwanda", UG: "Uganda", AO: "Angola",
  RS: "Serbia", HR: "Croatia", BA: "Bosnia", ME: "Montenegro",
  MK: "North Macedonia", AL: "Albania", XK: "Kosovo", MD: "Moldova",
  LT: "Lithuania", LV: "Latvia", EE: "Estonia", BG: "Bulgaria",
  HU: "Hungary", CZ: "Czechia", SK: "Slovakia", SI: "Slovenia",
  AT: "Austria", BE: "Belgium", DK: "Denmark", FI: "Finland",
  NO: "Norway", IE: "Ireland", PT: "Portugal", ES: "Spain", IT: "Italy",
  GR: "Greece", CY: "Cyprus", MT: "Malta", IS: "Iceland", LU: "Luxembourg",
  TW: "Taiwan", HK: "Hong Kong", MO: "Macau", MN: "Mongolia",
  NZ: "New Zealand", FJ: "Fiji", PG: "Papua New Guinea",
  IL: "Israel", JO: "Jordan", LB: "Lebanon", KW: "Kuwait",
  BH: "Bahrain", OM: "Oman", QA: "Qatar", PS: "Palestine",
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? COUNTRY_NAMES_EXTRA[code] ?? code;
}

const CENSORED_COUNTRIES = new Set([
  "AE", "AF", "BD", "BY", "CN", "CU", "EG", "ET", "IQ", "IR",
  "KZ", "MM", "PK", "RU", "SA", "TH", "TM", "TR", "UZ", "VE", "VN",
]);

const PRIMARY_COUNTRIES = new Set(["CN", "IR", "RU"]);

const ASN_NAMES: Record<string, string> = {
  // Iran
  AS44244: "Irancell", AS197207: "MCI", AS58224: "TCI", AS12880: "Afranet",
  AS48434: "MCCI", AS49100: "Pars Online", AS56402: "Pardis",
  AS43754: "Asiatech", AS25184: "Afranet ADSL",
  // China
  AS4134: "China Telecom", AS4837: "China Unicom", AS9808: "China Mobile",
  AS56040: "China Mobile GD", AS56046: "China Mobile ZJ",
  AS17621: "China Unicom Shanghai", AS4812: "China Telecom Shanghai",
  AS9929: "China Unicom Backbone", AS23724: "China Unicom IDC",
  // Russia
  AS12389: "Rostelecom", AS25513: "MTS", AS8359: "MTS OJSC",
  AS31133: "MegaFon", AS3216: "Vimpelcom", AS20485: "Transtelecom",
  // Myanmar
  AS136255: "MPT", AS133385: "Ooredoo", AS136442: "Telenor",
  // Belarus
  AS6697: "Beltelecom", AS25106: "MTS Belarus",
  // Turkmenistan
  AS51495: "Turkmentelecom",
  // Vietnam
  AS45899: "VNPT", AS7552: "Viettel", AS18403: "FPT Telecom",
  // Cuba
  AS27725: "ETECSA",
  // Saudi Arabia
  AS25019: "STC", AS35753: "Mobily", AS39386: "Zain KSA",
  // Pakistan
  AS9541: "Cybernet", AS45773: "PTCL", AS9557: "Nayatel",
  AS59257: "Zong", AS56167: "Telenor Pakistan",
  // UAE
  AS5384: "Etisalat", AS15802: "du",
  // Turkey
  AS9121: "Turk Telekom", AS16135: "Turkcell", AS34984: "Superonline",
  // Other
  AS7018: "AT&T", AS7922: "Comcast", AS209: "CenturyLink",
  AS3356: "Lumen", AS15169: "Google", AS13335: "Cloudflare",
  AS16509: "Amazon", AS8075: "Microsoft", AS32934: "Facebook",
  AS3320: "Deutsche Telekom", AS5511: "Orange", AS6830: "Liberty Global",
  AS2856: "BT", AS6461: "Zayo", AS174: "Cogent",
};

function asnDisplayName(asn: string, db: Record<string, string> | null): string {
  // The inline map uses "AS44244" keys
  if (ASN_NAMES[asn]) return ASN_NAMES[asn];
  const withPrefix = asn.startsWith("AS") ? asn : `AS${asn}`;
  if (ASN_NAMES[withPrefix]) return ASN_NAMES[withPrefix];
  // The JSON DB uses "AS209" keys, but API may return just "209"
  if (db) {
    if (db[asn]) return db[asn];
    if (db[withPrefix]) return db[withPrefix];
  }
  const num = asn.replace(/^AS/i, "");
  return db ? `ASN ${num}` : `${asn} (loading...)`;
}

function blockRateColor(rate: number): string {
  if (rate > 0.3) return "#e0a080";
  if (rate > 0.1) return "#d8c090";
  return "#a0c8a0";
}

function errorRateColor(rate: number): string {
  if (rate > 0.5) return "#e06060";
  if (rate > 0.2) return "#e0a080";
  if (rate > 0.05) return "#d8c090";
  return "#80c8a0";
}

function countryHealthColor(c: DashboardCountry): string {
  const errorRate = c.avgErrorRate ?? 0;
  if (c.avgBlockRate > 0.3 || errorRate > 0.5) return "#e06060";
  if (c.avgBlockRate > 0.1 || errorRate > 0.2) return "#e0a080";
  if (errorRate > 0.05) return "#d8c090";
  return "#00e5c8";
}

function successRateColor(rate: number): string {
  if (rate > 0.8) return "#a0c8a0";
  if (rate > 0.5) return "#d8c090";
  return "#e0a080";
}

const InfoIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3, cursor: "pointer", verticalAlign: "middle" }}>
    <circle cx="8" cy="8" r="7" stroke="#8890a0" strokeWidth="1.5" />
    <text x="8" y="11.5" textAnchor="middle" fill="#8890a0" fontSize="10" fontFamily="var(--font-sans)" fontWeight="600">i</text>
  </svg>
);

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.bottom });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <span style={{
          position: "fixed", left: Math.min(pos.x, window.innerWidth - 160), top: pos.y + 8,
          transform: "translateX(-50%)",
          background: "var(--bg-card)", border: "1px solid var(--accent-primary-dim, #00e5c830)", borderRadius: "var(--radius-md, 6px)",
          padding: "8px 12px", fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-secondary, #c0c8d4)",
          fontFamily: "var(--font-sans)", whiteSpace: "normal", width: "max-content", maxWidth: "320px",
          zIndex: 9999, pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(0,229,200,0.05)",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

function MiniBar({ value, color }: { value: number; color: string }) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div style={{ flex: 1, height: "3px", background: "#ffffff08", borderRadius: "2px", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${clamped * 100}%`, background: color, opacity: 0.5, borderRadius: "2px" }} />
    </div>
  );
}

const card: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  padding: "1rem 1.1rem",
  minWidth: 0,
  flex: "1 1 0",
};

const cardLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#8890a0",
  marginBottom: "0.3rem",
};

const cardValue: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "1.6rem",
  fontWeight: 600,
  lineHeight: 1.15,
};

const cardHint: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.6rem",
  color: "#667080",
  marginTop: "0.25rem",
  lineHeight: 1.3,
};

const countryHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.6rem 0.75rem",
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "1px solid #ffffff06",
  background: "rgba(255,255,255,0.015)",
  transition: "background 0.15s",
};

const ispRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.55rem 0.75rem 0.55rem 1.5rem",
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "1px solid #ffffff04",
  background: "rgba(255,255,255,0.008)",
  transition: "background 0.15s",
  fontFamily: "var(--font-mono)",
  fontSize: "0.8rem",
  color: "#c0c8d4",
};

const armRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.3rem 0.75rem 0.3rem 2.5rem",
  borderBottom: "1px solid #ffffff03",
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  color: "#a0a8b8",
};

const chipStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.58rem",
  padding: "0.12rem 0.35rem",
  borderRadius: "3px",
  background: "#ffffff08",
  color: "#8890a0",
  whiteSpace: "nowrap",
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.4rem 0.75rem",
  background: "rgba(255,255,255,0.015)",
  border: "1px solid #ffffff08",
  borderRadius: "6px",
  fontFamily: "var(--font-mono)",
  fontSize: "0.65rem",
  color: "#8890a0",
  flexWrap: "wrap",
};

const filterLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  color: "#8890a0",
};

const selectStyle: CSSProperties = {
  background: "var(--bg-card)",
  color: "#c0c8d4",
  border: "1px solid #ffffff14",
  borderRadius: "4px",
  padding: "0.2rem 0.4rem",
  fontFamily: "var(--font-mono)",
  fontSize: "0.65rem",
  cursor: "pointer",
};

const clearButtonStyle: CSSProperties = {
  background: "transparent",
  color: "#00e5c8",
  border: "1px solid rgba(0,229,200,0.25)",
  borderRadius: "4px",
  padding: "0.2rem 0.6rem",
  fontFamily: "var(--font-mono)",
  fontSize: "0.6rem",
  cursor: "pointer",
  marginLeft: "auto",
};

const blockedBadge: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.5rem",
  padding: "0.1rem 0.35rem",
  borderRadius: "3px",
  background: "#e0606020",
  color: "#e06060",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  whiteSpace: "nowrap",
};

const chevronStyle = (expanded: boolean): CSSProperties => ({
  fontFamily: "var(--font-mono)",
  fontSize: "0.55rem",
  color: "#667080",
  width: "1rem",
  textAlign: "center",
  transition: "transform 0.15s",
  transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
  flexShrink: 0,
});

function ArmRow({ arm, regionToCity }: { arm: DashboardArmEntry; regionToCity?: Map<string, string> }) {
  const sr = arm.successRate ?? (arm.totalTests && arm.totalTests > 0 ? (arm.successCount ?? 0) / arm.totalTests : undefined);
  const hasTests = arm.totalTests != null && arm.totalTests > 0;
  const srColor = sr != null ? successRateColor(sr) : "#667080";
  const regionLabel = arm.regionName
    ? (regionToCity?.get(arm.regionName) || arm.regionName)
    : undefined;
  const label = [arm.trackName, regionLabel].filter(Boolean).join(" · ") || arm.armId;

  return (
    <div style={armRowStyle}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" }}>
        {label}
      </span>

      {hasTests && sr != null && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "80px", flexShrink: 0 }}>
          <MiniBar value={sr} color={srColor} />
          <span style={{ color: srColor, fontSize: "0.58rem", minWidth: "32px", textAlign: "right" }}>
            {Math.round(sr * 100)}%
          </span>
        </div>
      )}

      {hasTests && (
        <Tip text={`${arm.successCount ?? 0} of ${arm.totalTests} first probe observations succeeded (1-hour rolling window). Each observation is either a probe's first callback (success if reward > 0.1) or a reaper expiration (always failure — probe never received any callback within 30 seconds). Repeat callbacks are not counted here. The bandit marks an arm as "blocked" when the success rate drops below 15%.`}>
          <span style={chipStyle}>
            {arm.successCount ?? 0}/{arm.totalTests} ok <InfoIcon />
          </span>
        </Tip>
      )}

      {arm.selectionProbability != null && (
        <Tip text="Selection probability — the chance the bandit picks this arm for the next request. Higher means the algorithm has learned this arm works well.">
          <span style={chipStyle}>
            P={Math.round(arm.selectionProbability * 100)}% <InfoIcon />
          </span>
        </Tip>
      )}

      {arm.activeVps != null && arm.activeVps > 0 && (
        <Tip text="Number of active VPS instances running in this arm (region+protocol combination). Each VPS can serve multiple clients.">
          <span style={chipStyle}>
            {arm.activeVps} VPS <InfoIcon />
          </span>
        </Tip>
      )}

      {arm.activeDevices != null && arm.activeDevices > 0 && (
        <Tip text="Approximate number of unique devices that have successfully connected through routes in this arm in the last 24 hours, tracked via HyperLogLog.">
          <span style={chipStyle}>
            {arm.activeDevices} device{arm.activeDevices !== 1 ? "s" : ""} <InfoIcon />
          </span>
        </Tip>
      )}

      {arm.routesPerClient != null && arm.routesPerClient > 0 && (
        <Tip text="How many routes from this arm each client receives. More routes per client means better redundancy if one route gets blocked.">
          <span style={chipStyle}>
            {arm.routesPerClient}/client <InfoIcon />
          </span>
        </Tip>
      )}

      {arm.blocked && (
        <Tip text="Success rate dropped below 10% — the bandit has marked this arm as blocked and will shift traffic to other arms. Could be censorship, network issues, or server problems.">
          <span style={blockedBadge}>blocked</span>
        </Tip>
      )}
    </div>
  );
}

// Derive the protocol from a trackName like "reflex-linode-pro" or
// "samizdat-pro-oci". First hyphen-separated segment is the protocol.
function protocolFromTrackName(trackName: string | undefined): string {
  if (!trackName) return "";
  const idx = trackName.indexOf("-");
  return idx > 0 ? trackName.substring(0, idx) : trackName;
}

type SortBy = "weight" | "successRate";

function armSuccessRate(arm: DashboardArmEntry): number | null {
  if (arm.successRate != null) return arm.successRate;
  if (arm.totalTests != null && arm.totalTests > 0) {
    return (arm.successCount ?? 0) / arm.totalTests;
  }
  return null;
}

interface ArmFilters {
  region: string;   // empty = all
  protocol: string; // empty = all
  sortBy: SortBy;
}

function filterAndSortArms(arms: DashboardArmEntry[], f: ArmFilters): DashboardArmEntry[] {
  let out = arms;
  if (f.region) {
    out = out.filter((a) => a.regionName === f.region);
  }
  if (f.protocol) {
    out = out.filter((a) => protocolFromTrackName(a.trackName) === f.protocol);
  }
  if (f.sortBy === "successRate") {
    // Arms with no test data sort to the bottom.
    out = [...out].sort((a, b) => {
      const ra = armSuccessRate(a);
      const rb = armSuccessRate(b);
      if (ra == null && rb == null) return b.weight - a.weight;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    });
  } else {
    out = [...out].sort((a, b) => b.weight - a.weight);
  }
  return out;
}

function ISPSection({ asn, country, expandedASNs, toggleASN, asnDB, regionToCity, filters, onLiveArmsLoaded }: { asn: DashboardASN; country: string; expandedASNs: Set<string>; toggleASN: (key: string) => void; asnDB: Record<string, string> | null; regionToCity?: Map<string, string>; filters: ArmFilters; onLiveArmsLoaded?: (asn: string, arms: DashboardArmEntry[]) => void }) {
  const key = `${country}-${asn.asn}`;
  const expanded = expandedASNs.has(key);
  const name = asnDisplayName(asn.asn, asnDB);
  const blockedColor = asn.numBlocked > 0 ? "#e06060" : "#667080";

  // Live-fetched full arm set (vs snapshot top-N). Loaded on demand when the
  // user clicks "Show all arms" — reads directly from Redis on the server,
  // so it's fresher than the snapshot and uncapped.
  const [allArms, setAllArms] = useState<DashboardArmEntry[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allArmsErr, setAllArmsErr] = useState<string | null>(null);

  const loadAllArms = useCallback(() => {
    setLoadingAll(true);
    setAllArmsErr(null);
    fetchASNArms(asn.asn)
      .then((resp) => {
        setAllArms(resp.arms);
        // Let the parent union these regions/protocols into the filter
        // dropdowns so low-weight arms that only appear in the live fetch
        // are still filterable.
        onLiveArmsLoaded?.(asn.asn, resp.arms);
      })
      .catch((e) => {
        // Log the raw error for operators inspecting the console; show a
        // short friendly message in the UI so the page doesn't expose
        // transport-level details.
        console.error("Failed to load ASN arms", e);
        setAllArmsErr("Unable to load all arms right now. Please try again.");
      })
      .finally(() => { setLoadingAll(false); });
  }, [asn.asn, onLiveArmsLoaded]);

  const baseArms = allArms ?? asn.topArms;
  const displayedArms = useMemo(() => filterAndSortArms(baseArms, filters), [baseArms, filters]);
  const filtersActive = !!filters.region || !!filters.protocol || filters.sortBy !== "weight";
  const hasMoreBeyondSnapshot = asn.topArms.length < asn.numArms;
  const showFullLoadButton = expanded && allArms === null && hasMoreBeyondSnapshot;

  return (
    <div>
      <div
        style={ispRowStyle}
        onClick={() => toggleASN(key)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.008)"; }}
      >
        <span style={chevronStyle(expanded)}>&#9662;</span>
        <span style={{ fontWeight: 600, color: "#c0c8d4" }}>{name}</span>
        <span style={{ fontSize: "0.65rem", color: "#667080" }}>{name !== asn.asn ? asn.asn : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={chipStyle}>
            {asn.numArms} arms{allArms ? ` (all shown, live)` : asn.topArms.length < asn.numArms ? ` (top ${asn.topArms.length} shown)` : ""}
          </span>
          <Tip text="Arms where connections are failing vs total arms. Could be censorship, network issues, or server problems.">
            <span style={{ ...chipStyle, color: blockedColor }}>
              {asn.numBlocked}/{asn.numArms} blocked <InfoIcon />
            </span>
          </Tip>
          <span style={chipStyle}>{asn.totalPulls.toLocaleString()} pulls</span>
        </span>
      </div>
      {expanded && displayedArms.length > 0 && (
        <div>
          {displayedArms.map((arm) => (
            <ArmRow key={arm.armId} arm={arm} regionToCity={regionToCity} />
          ))}
        </div>
      )}
      {expanded && displayedArms.length === 0 && baseArms.length > 0 && filtersActive && (
        <div style={{ padding: "0.5rem 1rem", fontSize: "0.7rem", color: "#667080" }}>
          No arms match the current filters.
        </div>
      )}
      {showFullLoadButton && (
        <div style={{ padding: "0.5rem 1rem", fontSize: "0.7rem" }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); loadAllArms(); }}
            disabled={loadingAll}
            style={{
              background: "transparent",
              color: "#00e5c8",
              border: "1px solid rgba(0,229,200,0.3)",
              borderRadius: "4px",
              padding: "0.3rem 0.75rem",
              cursor: loadingAll ? "wait" : "pointer",
              fontSize: "0.7rem",
            }}
          >
            {loadingAll ? "Loading…" : `Show all ${asn.numArms} arms (live)`}
          </button>
          {allArmsErr && (
            <span style={{ marginLeft: "0.75rem", color: "#e06060" }}>{allArmsErr}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function BanditHowItWorks() {
  return (
    <div style={{ background: "rgba(0,229,200,0.04)", border: "1px solid rgba(0,229,200,0.15)", borderRadius: "8px", padding: "1rem 1.25rem", fontSize: "0.72rem", color: "#8090a0", lineHeight: 1.6 }}>
      <div style={{ color: "#c0c8d4", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>How the bandit works</div>
      <BanditHowItWorksContent />
    </div>
  );
}

function BanditHowItWorksContent() {
  return (
        <div>
          {/* Feedback Loop Diagram */}
          <svg viewBox="0 0 720 280" style={{ width: "100%", maxWidth: "720px", margin: "0.5rem 0" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#00e5c8" /></marker>
              <marker id="arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#506070" /></marker>
            </defs>
            {/* Boxes */}
            <rect x="10" y="20" width="140" height="50" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
            <text x="80" y="42" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Client polls</text>
            <text x="80" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">config (60s–15min)</text>

            <rect x="200" y="20" width="140" height="50" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
            <text x="270" y="42" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">API selects arms</text>
            <text x="270" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">EXP3.S (γ=0.20)</text>

            <rect x="390" y="20" width="140" height="50" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
            <text x="460" y="42" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Client connects</text>
            <text x="460" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">via proxy routes</text>

            <rect x="570" y="20" width="140" height="50" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
            <text x="640" y="42" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Callback</text>
            <text x="640" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">hits API server</text>

            {/* Forward arrows */}
            <line x1="150" y1="45" x2="196" y2="45" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1="340" y1="45" x2="386" y2="45" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1="530" y1="45" x2="566" y2="45" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Reward box */}
            <rect x="520" y="110" width="160" height="50" rx="8" fill="rgba(255,180,50,0.08)" stroke="#ffb432" strokeWidth="1.5" />
            <text x="600" y="132" textAnchor="middle" fill="#ffb432" fontSize="11" fontWeight="600">Compute reward</text>
            <text x="600" y="147" textAnchor="middle" fill="#8090a0" fontSize="9">relative latency rank</text>
            <line x1="640" y1="70" x2="640" y2="106" stroke="#ffb432" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Weights box */}
            <rect x="200" y="110" width="160" height="50" rx="8" fill="rgba(100,180,255,0.08)" stroke="#64b4ff" strokeWidth="1.5" />
            <text x="280" y="132" textAnchor="middle" fill="#64b4ff" fontSize="11" fontWeight="600">Per-ASN weights</text>
            <text x="280" y="147" textAnchor="middle" fill="#8090a0" fontSize="9">Redis (α=0.01 decay)</text>

            {/* Reward → Weights */}
            <line x1="520" y1="135" x2="364" y2="135" stroke="#ffb432" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Weights → Selection */}
            <line x1="270" y1="110" x2="270" y2="74" stroke="#64b4ff" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Blocking signals box */}
            <rect x="520" y="195" width="160" height="50" rx="8" fill="rgba(255,80,80,0.08)" stroke="#ff5050" strokeWidth="1.5" />
            <text x="600" y="217" textAnchor="middle" fill="#ff5050" fontSize="11" fontWeight="600">Blocking signals</text>
            <text x="600" y="232" textAnchor="middle" fill="#8090a0" fontSize="9">4 levels of detection</text>
            <line x1="600" y1="160" x2="600" y2="191" stroke="#ff5050" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Blocking → Weights (penalty) */}
            <line x1="520" y1="220" x2="280" y2="164" stroke="#ff5050" strokeWidth="1" strokeDasharray="4,3" markerEnd="url(#arrow-dim)" />
            <text x="390" y="185" textAnchor="middle" fill="#506070" fontSize="8">penalty ×0.01</text>

            {/* Labels */}
            <text x="440" y="130" textAnchor="middle" fill="#506070" fontSize="8">updates</text>
          </svg>

          {/* Blocking Hierarchy Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "0.4rem 0", fontSize: "0.68rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#c0c8d4" }}>Blocking Level</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#c0c8d4" }}>Threshold</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#c0c8d4" }}>Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: "3px 8px" }}>Per-ASN + track</td><td style={{ padding: "3px 8px" }}>20</td><td style={{ padding: "3px 8px" }}>Weight penalty for this ISP</td></tr>
              <tr><td style={{ padding: "3px 8px" }}>Per-country + track</td><td style={{ padding: "3px 8px" }}>100</td><td style={{ padding: "3px 8px" }}>Weight penalty for entire country</td></tr>
              <tr><td style={{ padding: "3px 8px", color: "#ff5050" }}>Per-route (global)</td><td style={{ padding: "3px 8px" }}>100</td><td style={{ padding: "3px 8px" }}>Route deprecated after 1h grace</td></tr>
              <tr><td style={{ padding: "3px 8px", color: "#ffb432" }}>Per-route + country</td><td style={{ padding: "3px 8px" }}>50</td><td style={{ padding: "3px 8px" }}>Route excluded for that country only</td></tr>
            </tbody>
          </table>
          <p>The bandit uses the <strong>EXP3.S algorithm</strong> to learn which proxy routes work best for each ISP (ASN). Each <strong>arm</strong> is a region + protocol combination (e.g., "Frankfurt + samizdat"). On each config fetch, the bandit selects arms probabilistically — favoring arms with higher weights but always exploring alternatives (20% random).</p>
          <p style={{ marginTop: "0.4rem" }}>When a proxy connects successfully, the client hits a <strong>callback URL</strong> — that's how the server knows it worked. The <strong>reward</strong> is based on relative latency: an arm's latency is ranked against all other arms for this ASN, so 2000ms is "good" if everything else is 3000ms+. Failed callbacks (no response within 30s) get reward=0.</p>
          <p style={{ marginTop: "0.4rem" }}><strong>Blocking detection</strong> works at four levels: per-ASN (is this protocol blocked on this ISP?), per-country (blocked nationally?), per-route globally (this IP is burned everywhere), and per-route per-country (this IP is burned in Iran but works in the US). Blocked arms get their weights penalized; blocked routes are excluded from selection for affected countries.</p>
          <p style={{ marginTop: "0.4rem" }}>Weights decay toward uniform at rate α=0.01, preventing early luck from creating permanent dominance. The poll interval adapts: 60s when learning, up to 15min when converged.</p>

          {/* Auto-Scaling Section */}
          <div style={{ marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontWeight: 600, color: "#c0c8d4", fontSize: "0.75rem", marginBottom: "0.35rem" }}>Auto-scaling: how capacity grows with demand</p>

            <svg viewBox="0 0 720 200" style={{ width: "100%", maxWidth: "720px", margin: "0.5rem 0" }}>
              <defs>
                <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#50c878" /></marker>
                <marker id="arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#00e5c8" /></marker>
                <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64b4ff" /></marker>
                <marker id="arrow-orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb432" /></marker>
              </defs>

              {/* Step 1: Callback */}
              <rect x="10" y="20" width="150" height="50" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
              <text x="85" y="40" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Client callback</text>
              <text x="85" y="55" textAnchor="middle" fill="#8090a0" fontSize="9">on successful connect</text>

              {/* Step 2: HLL */}
              <rect x="200" y="20" width="150" height="50" rx="8" fill="rgba(80,200,120,0.1)" stroke="#50c878" strokeWidth="1.5" />
              <text x="275" y="40" textAnchor="middle" fill="#50c878" fontSize="11" fontWeight="600">Redis HLL PFADD</text>
              <text x="275" y="55" textAnchor="middle" fill="#8090a0" fontSize="9">per-route device count</text>

              {/* Step 3: Pool Worker */}
              <rect x="390" y="20" width="160" height="50" rx="8" fill="rgba(100,180,255,0.1)" stroke="#64b4ff" strokeWidth="1.5" />
              <text x="470" y="40" textAnchor="middle" fill="#64b4ff" fontSize="11" fontWeight="600">Pool worker (30min)</text>
              <text x="470" y="55" textAnchor="middle" fill="#8090a0" fontSize="9">PFCOUNT per location</text>

              {/* Step 4: Provision */}
              <rect x="590" y="20" width="120" height="50" rx="8" fill="rgba(255,180,50,0.1)" stroke="#ffb432" strokeWidth="1.5" />
              <text x="650" y="40" textAnchor="middle" fill="#ffb432" fontSize="11" fontWeight="600">Provision VPS</text>
              <text x="650" y="55" textAnchor="middle" fill="#8090a0" fontSize="9">new routes created</text>

              {/* Arrows */}
              <line x1="160" y1="45" x2="196" y2="45" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#arrow-cyan)" />
              <line x1="350" y1="45" x2="386" y2="45" stroke="#50c878" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
              <line x1="550" y1="45" x2="586" y2="45" stroke="#64b4ff" strokeWidth="1.5" markerEnd="url(#arrow-blue)" />

              {/* Decision diamond */}
              <rect x="390" y="100" width="160" height="50" rx="8" fill="rgba(255,180,50,0.06)" stroke="#ffb432" strokeWidth="1" strokeDasharray="4,3" />
              <text x="470" y="120" textAnchor="middle" fill="#ffb432" fontSize="10" fontWeight="600">utilization {'>'} 70%?</text>
              <text x="470" y="135" textAnchor="middle" fill="#8090a0" fontSize="9">devices / (routes × max_clients)</text>
              <line x1="470" y1="70" x2="470" y2="96" stroke="#ffb432" strokeWidth="1" strokeDasharray="4,3" markerEnd="url(#arrow-orange)" />

              {/* Scale-up path */}
              <text x="570" y="118" fill="#50c878" fontSize="9" fontWeight="600">yes → scale up</text>
              <text x="570" y="133" fill="#8090a0" fontSize="8">target = devices / 50% capacity</text>

              {/* No-op path */}
              <text x="310" y="118" fill="#667080" fontSize="9">no → maintain pool</text>

              {/* EXP3.S load balancing note */}
              <rect x="10" y="100" width="230" height="50" rx="8" fill="rgba(100,180,255,0.06)" stroke="#64b4ff" strokeWidth="1" strokeDasharray="4,3" />
              <text x="125" y="120" textAnchor="middle" fill="#64b4ff" fontSize="10" fontWeight="600">EXP3.S load balancing</text>
              <text x="125" y="135" textAnchor="middle" fill="#8090a0" fontSize="8.5">overloaded routes → poor reward → less traffic</text>

              {/* HLL detail */}
              <rect x="10" y="165" width="700" height="28" rx="6" fill="rgba(255,255,255,0.02)" />
              <text x="20" y="183" fill="#8090a0" fontSize="8.5">HyperLogLog: probabilistic data structure that counts unique device IDs per route with ~1% error. Each key has a 24-hour TTL, so counts reflect recent activity only.</text>
            </svg>

            <p>The system automatically scales VPS capacity using two complementary mechanisms:</p>

            <p style={{ marginTop: "0.35rem" }}><strong>1. HLL-based pool scaling</strong> — Every successful client callback records the device ID in a Redis <strong>HyperLogLog</strong> (PFADD) per route. Every 30 minutes, the pool worker merges HLL counts (PFCOUNT) per location to get unique active devices. If utilization exceeds <strong>70%</strong> — calculated as <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: "3px", fontSize: "0.65rem" }}>active_devices / (running_routes × max_clients_per_route)</code> — new VPS instances are provisioned to bring utilization down to ~50%. HLL keys expire after 24 hours, so the count naturally reflects the active device window.</p>

            <p style={{ marginTop: "0.35rem" }}><strong>2. EXP3.S natural load balancing</strong> — There is no hard capacity cap on individual routes. Instead, when a route becomes overloaded, its latency increases, which produces <strong>worse rewards</strong> in the EXP3.S algorithm. The bandit then shifts traffic to faster routes within seconds. This adaptive loop means brief utilization spikes between pool worker cycles are handled gracefully — the bandit stops sending traffic to stressed routes before they drop connections.</p>

            <p style={{ marginTop: "0.35rem" }}><strong>Base pool size</strong> is configured per track (the <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: "3px", fontSize: "0.65rem" }}>vps_pool_size</code> setting). The pool worker maintains at least this many VPS instances per location, provisioning replacements when routes are deprecated or fail. Scale-up from device pressure adds routes <em>beyond</em> this baseline.</p>

            <p style={{ marginTop: "0.35rem", color: "#667080" }}>Together: the pool worker ensures enough capacity exists (supply side), while EXP3.S distributes traffic optimally across available capacity (demand side). Neither mechanism alone is sufficient — the pool worker can't react faster than its 30-minute cycle, and EXP3.S can't create new infrastructure.</p>
          </div>
        </div>
  );
}

interface CountryRowProps {
  c: DashboardCountry;
  expandedCountries: Set<string>;
  loadingCountries: Set<string>;
  asnCache: Map<string, DashboardASN[]>;
  toggleCountry: (code: string) => void;
  expandedASNs: Set<string>;
  toggleASN: (key: string) => void;
  asnDB: Record<string, string> | null;
  regionToCity: Map<string, string>;
  armFilters: ArmFilters;
  handleLiveArmsLoaded: (asn: string, arms: DashboardArmEntry[]) => void;
}

function CountryRow({
  c, expandedCountries, loadingCountries, asnCache, toggleCountry,
  expandedASNs, toggleASN, asnDB, regionToCity, armFilters, handleLiveArmsLoaded,
}: CountryRowProps) {
  const expanded = expandedCountries.has(c.country);
  const loading = loadingCountries.has(c.country);
  const asns = asnCache.get(c.country);
  const brColor = blockRateColor(c.avgBlockRate);
  const erColor = c.avgErrorRate != null ? errorRateColor(c.avgErrorRate) : "#556070";
  const nameColor = countryHealthColor(c);

  return (
    <div>
      <div
        style={countryHeaderStyle}
        onClick={() => toggleCountry(c.country)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.015)"; }}
      >
        <span style={chevronStyle(expanded)}>&#9662;</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", fontWeight: 700, color: nameColor }}>
          {countryName(c.country)}
        </span>
        <span style={chipStyle}>{asns ? asns.length : c.asnCount} ASN{(asns ? asns.length : c.asnCount) !== 1 ? "s" : ""}</span>

        <Tip text={`${(c.avgBlockRate * 100).toFixed(1)}% of arms are blocked in ${countryName(c.country)}.`}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "80px" }}>
            <MiniBar value={c.avgBlockRate} color={brColor} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: brColor, minWidth: "32px", textAlign: "right" }}>
              {c.avgBlockRate < 0.01 ? (c.avgBlockRate * 100).toFixed(2) : (c.avgBlockRate * 100).toFixed(1)}%
            </span>
          </div>
        </Tip>

        {c.avgErrorRate != null && (
          <Tip text={`${(c.avgErrorRate * 100).toFixed(1)}% of probe callbacks fail in ${countryName(c.country)}. Unlike block rate (binary per arm), error rate shows continuous connection quality.`}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "80px" }}>
              <MiniBar value={c.avgErrorRate} color={erColor} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: erColor, minWidth: "32px", textAlign: "right" }}>
                {(c.avgErrorRate * 100).toFixed(1)}%
              </span>
            </div>
          </Tip>
        )}

        <Tip text={`Weight entropy: ${c.avgEntropy.toFixed(3)}. ${c.avgEntropy < 0.5 ? "Strongly converged." : c.avgEntropy < 1.5 ? "Moderate focus." : "High exploration."}`}>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "#8890a0" }}>
            H={c.avgEntropy.toFixed(2)}
            <span style={{ fontSize: "0.6rem", color: "#556070", marginLeft: "0.3rem" }}>
              {c.avgEntropy < 0.5 ? "converged" : c.avgEntropy < 1.5 ? "focused" : "exploring"}
            </span>
          </span>
        </Tip>
      </div>

      {expanded && (
        <div>
          {loading && (
            <div style={{ padding: "0.6rem 1.5rem", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#667080" }}>
              Loading ISPs...
            </div>
          )}
          {!loading && asns && asns.length === 0 && (
            <div style={{ padding: "0.6rem 1.5rem", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#667080" }}>
              No ASN data
            </div>
          )}
          {!loading && asns && asns.map((asn) => (
            <ISPSection
              key={asn.asn}
              asn={asn}
              country={c.country}
              expandedASNs={expandedASNs}
              toggleASN={toggleASN}
              asnDB={asnDB}
              regionToCity={regionToCity}
              filters={armFilters}
              onLiveArmsLoaded={handleLiveArmsLoaded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BanditArmsOverview({ countries, dataCenters, isLive }: BanditArmsOverviewProps) {
  const regionToCity = useMemo(() => {
    const map = new Map<string, string>();
    if (dataCenters) {
      for (const dc of dataCenters) {
        if (dc.city) map.set(dc.regionName, dc.city);
      }
    }
    return map;
  }, [dataCenters]);
  const asnDB = useASNNames();
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedASNs, setExpandedASNs] = useState<Set<string>>(new Set());
  const [asnCache, setAsnCache] = useState<Map<string, DashboardASN[]>>(new Map());
  const [loadingCountries, setLoadingCountries] = useState<Set<string>>(new Set());
  // Full live-arm fetches keyed by ASN. Populated when a user clicks "Show all
  // arms (live)" inside an ISPSection; the regions/protocols seen here get
  // merged into the filter dropdown options below.
  const [liveArmsCache, setLiveArmsCache] = useState<Map<string, DashboardArmEntry[]>>(new Map());
  const handleLiveArmsLoaded = useCallback((asn: string, arms: DashboardArmEntry[]) => {
    setLiveArmsCache((prev) => {
      const next = new Map(prev);
      next.set(asn, arms);
      return next;
    });
  }, []);

  // Arm filter / sort state — applies to every expanded ASN's arm list.
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [protocolFilter, setProtocolFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("weight");
  const armFilters: ArmFilters = useMemo(
    () => ({ region: regionFilter, protocol: protocolFilter, sortBy }),
    [regionFilter, protocolFilter, sortBy],
  );

  // Collect unique region names / protocol names across every arm we know
  // about so the filter dropdowns stay current as the asn cache fills in.
  const { availableRegions, availableProtocols } = useMemo(() => {
    const regions = new Set<string>();
    const protocols = new Set<string>();
    const addArm = (arm: DashboardArmEntry) => {
      if (arm.regionName) regions.add(arm.regionName);
      const proto = protocolFromTrackName(arm.trackName);
      if (proto) protocols.add(proto);
    };
    for (const asnList of asnCache.values()) {
      for (const asn of asnList) {
        for (const arm of asn.topArms) addArm(arm);
      }
    }
    // Also include arms discovered via the live per-ASN fetch so low-weight
    // regions/protocols that never made the snapshot top-N are still
    // filterable once a user drills in.
    for (const arms of liveArmsCache.values()) {
      for (const arm of arms) addArm(arm);
    }
    return {
      availableRegions: Array.from(regions).sort(),
      availableProtocols: Array.from(protocols).sort(),
    };
  }, [asnCache, liveArmsCache]);

  const { primaryCountries, otherCensoredCountries, uncensoredCountries } = useMemo(() => {
    const primary: DashboardCountry[] = [];
    const otherCensored: DashboardCountry[] = [];
    const uncensored: DashboardCountry[] = [];
    for (const c of countries) {
      if (PRIMARY_COUNTRIES.has(c.country)) primary.push(c);
      else if (CENSORED_COUNTRIES.has(c.country)) otherCensored.push(c);
      else uncensored.push(c);
    }
    const alpha = (a: DashboardCountry, b: DashboardCountry) =>
      countryName(a.country).localeCompare(countryName(b.country));
    primary.sort(alpha);
    otherCensored.sort(alpha);
    uncensored.sort(alpha);
    return { primaryCountries: primary, otherCensoredCountries: otherCensored, uncensoredCountries: uncensored };
  }, [countries]);

  const [showOtherCensored, setShowOtherCensored] = useState(false);
  const [showUncensored, setShowUncensored] = useState(false);

  const totalASNs = useMemo(() => {
    let total = 0;
    for (const c of countries) {
      const cached = asnCache.get(c.country);
      total += cached ? cached.length : c.asnCount;
    }
    return total;
  }, [countries, asnCache]);

  const weightedBlockRate = useMemo(() => {
    const totalWeight = countries.reduce((s, c) => s + c.asnCount, 0);
    if (totalWeight === 0) return 0;
    return countries.reduce((s, c) => s + c.avgBlockRate * c.asnCount, 0) / totalWeight;
  }, [countries]);

  const weightedEntropy = useMemo(() => {
    const totalWeight = countries.reduce((s, c) => s + c.asnCount, 0);
    if (totalWeight === 0) return 0;
    return countries.reduce((s, c) => s + c.avgEntropy * c.asnCount, 0) / totalWeight;
  }, [countries]);

  const weightedErrorRate = useMemo((): number | null => {
    const totalTests = countries.reduce((s, c) => s + (c.totalTests ?? 0), 0);
    if (totalTests === 0) return null;
    const totalSuccess = countries.reduce((s, c) => s + (c.totalSuccess ?? 0), 0);
    return 1 - totalSuccess / totalTests;
  }, [countries]);

  // Fetch ASN data for all countries and refresh every 30s
  useEffect(() => {
    const refreshAll = () => {
      for (const c of countries) {
        fetchASNs(c.country)
          .then((data) => setAsnCache((prev) => new Map(prev).set(c.country, data)))
          .catch(() => {});
      }
    };
    refreshAll();
    const interval = setInterval(refreshAll, 30000);
    return () => clearInterval(interval);
  }, [countries]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCountry = useCallback(async (countryCode: string) => {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(countryCode)) {
        next.delete(countryCode);
        return next;
      }
      next.add(countryCode);
      return next;
    });

    if (!loadingCountries.has(countryCode)) {
      setLoadingCountries((prev) => new Set(prev).add(countryCode));
      try {
        const data = await fetchASNs(countryCode);
        setAsnCache((prev) => new Map(prev).set(countryCode, data));
      } catch {
        // Keep existing cache on error rather than clearing
      } finally {
        setLoadingCountries((prev) => {
          const next = new Set(prev);
          next.delete(countryCode);
          return next;
        });
      }
    }
  }, [loadingCountries]);

  const toggleASN = useCallback((key: string) => {
    setExpandedASNs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (countries.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        {isLive ? "No bandit data available" : "Connecting to API..."}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem", background: "var(--bg-card)" }}>
      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        <Tip text="Countries where Lantern clients are actively connecting through the bandit-based route selection system.">
          <div style={card}>
            <div style={cardLabel}>Countries <InfoIcon /></div>
            <div style={{ ...cardValue, color: "#00e5c8" }}>{countries.length}</div>
            <div style={cardHint}>with active bandit routing</div>
          </div>
        </Tip>
        <Tip text="Autonomous System Numbers — each represents an ISP or network operator. The bandit learns separate route preferences for each ASN because censorship varies by ISP.">
          <div style={card}>
            <div style={cardLabel}>Total ASNs <InfoIcon /></div>
            <div style={{ ...cardValue, color: "#c0c8d4" }}>{totalASNs}</div>
            <div style={cardHint}>ISPs / network operators</div>
          </div>
        </Tip>
        <Tip text="Percentage of arms (region+protocol combinations) that the bandit has marked as blocked. An arm is blocked when its probe success rate drops below 10%, indicating censorship or network issues. Lower is better.">
          <div style={card}>
            <div style={cardLabel}>Avg Block Rate <InfoIcon /></div>
            <div style={{ ...cardValue, color: blockRateColor(weightedBlockRate) }}>
              {weightedBlockRate < 0.01 ? (weightedBlockRate * 100).toFixed(2) : (weightedBlockRate * 100).toFixed(1)}%
            </div>
            <div style={cardHint}>of arms blocked across all ISPs</div>
          </div>
        </Tip>
        <Tip text="Percentage of probe callbacks that fail. Unlike block rate (binary: an arm is either blocked or not), error rate shows continuous connection quality. A country may have 0% block rate but 30% error rate — meaning connections are degraded but no arms have crossed the blocking threshold.">
          <div style={card}>
            <div style={cardLabel}>Avg Error Rate <InfoIcon /></div>
            <div style={{ ...cardValue, color: weightedErrorRate != null ? errorRateColor(weightedErrorRate) : "#667080" }}>
              {weightedErrorRate != null ? `${(weightedErrorRate * 100).toFixed(1)}%` : "N/A"}
            </div>
            <div style={cardHint}>probe callback failures</div>
          </div>
        </Tip>
        <Tip text={`Shannon entropy measures how spread out the bandit's weight distribution is across arms. Low entropy (near 0) means the algorithm has converged on one or two winning arms. High entropy (near ${Math.log2(Math.max(2, totalASNs)).toFixed(1)}) means it's still exploring equally across all options. Moderate values indicate a healthy balance between exploiting known-good arms and exploring alternatives.`}>
          <div style={card}>
            <div style={cardLabel}>Avg Entropy <InfoIcon /></div>
            <div style={{ ...cardValue, color: "#a0b0c8" }}>
              {weightedEntropy.toFixed(3)}
            </div>
            <div style={cardHint}>
              {weightedEntropy < 0.5 ? "strongly converged — using best arms" :
               weightedEntropy < 1.5 ? "moderately focused — good balance" :
               "high exploration — still learning"}
            </div>
          </div>
        </Tip>
      </div>

      {/* Arm filter / sort controls */}
      <div style={filterBarStyle}>
        <label style={filterLabelStyle}>
          Region
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All</option>
            {availableRegions.map((r) => (
              <option key={r} value={r}>
                {regionToCity.get(r) ? `${regionToCity.get(r)} (${r})` : r}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          Protocol
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All</option>
            {availableProtocols.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          Sort by
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            style={selectStyle}
          >
            <option value="weight">Weight (default)</option>
            <option value="successRate">Success rate</option>
          </select>
        </label>
        {(regionFilter || protocolFilter || sortBy !== "weight") && (
          <button
            type="button"
            onClick={() => { setRegionFilter(""); setProtocolFilter(""); setSortBy("weight"); }}
            style={clearButtonStyle}
          >
            Clear
          </button>
        )}
      </div>

      {/* Country list — 3 tiers */}
      <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid #ffffff08", overflow: "auto", flex: 1 }}>
        {/* Tier 1: China, Iran, Russia — always visible */}
        {primaryCountries.map((c) => (
          <CountryRow key={c.country} c={c} expandedCountries={expandedCountries} loadingCountries={loadingCountries}
            asnCache={asnCache} toggleCountry={toggleCountry} expandedASNs={expandedASNs} toggleASN={toggleASN}
            asnDB={asnDB} regionToCity={regionToCity} armFilters={armFilters} handleLiveArmsLoaded={handleLiveArmsLoaded} />
        ))}

        {/* Tier 2: Other censored countries — collapsible */}
        {otherCensoredCountries.length > 0 && (
          <>
            <div
              onClick={() => setShowOtherCensored((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.5rem 0.75rem", cursor: "pointer", userSelect: "none",
                borderTop: "1px solid #ffffff08", borderBottom: showOtherCensored ? "1px solid #ffffff08" : "none",
                background: "rgba(255,255,255,0.01)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.01)"; }}
            >
              <span style={chevronStyle(showOtherCensored)}>&#9662;</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "#8090a0", letterSpacing: "0.03em" }}>
                Other censored countries ({otherCensoredCountries.length})
              </span>
            </div>
            {showOtherCensored && otherCensoredCountries.map((c) => (
              <CountryRow key={c.country} c={c} expandedCountries={expandedCountries} loadingCountries={loadingCountries}
                asnCache={asnCache} toggleCountry={toggleCountry} expandedASNs={expandedASNs} toggleASN={toggleASN}
                asnDB={asnDB} regionToCity={regionToCity} armFilters={armFilters} handleLiveArmsLoaded={handleLiveArmsLoaded} />
            ))}
          </>
        )}

        {/* Tier 3: Uncensored countries — collapsible */}
        {uncensoredCountries.length > 0 && (
          <>
            <div
              onClick={() => setShowUncensored((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.5rem 0.75rem", cursor: "pointer", userSelect: "none",
                borderTop: "1px solid #ffffff08", borderBottom: showUncensored ? "1px solid #ffffff08" : "none",
                background: "rgba(255,255,255,0.01)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.01)"; }}
            >
              <span style={chevronStyle(showUncensored)}>&#9662;</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "#667080", letterSpacing: "0.03em" }}>
                Other countries ({uncensoredCountries.length})
              </span>
            </div>
            {showUncensored && uncensoredCountries.map((c) => (
              <CountryRow key={c.country} c={c} expandedCountries={expandedCountries} loadingCountries={loadingCountries}
                asnCache={asnCache} toggleCountry={toggleCountry} expandedASNs={expandedASNs} toggleASN={toggleASN}
                asnDB={asnDB} regionToCity={regionToCity} armFilters={armFilters} handleLiveArmsLoaded={handleLiveArmsLoaded} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(BanditArmsOverview);
