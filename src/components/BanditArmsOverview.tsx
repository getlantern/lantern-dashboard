import { useState, useEffect, useMemo, useCallback, memo, type CSSProperties } from "react";
import type {
  DashboardCountry,
  DashboardASN,
  DashboardArmEntry,
} from "../api/client";
import { fetchASNs } from "../api/client";

interface BanditArmsOverviewProps {
  countries: DashboardCountry[];
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

function successRateColor(rate: number): string {
  if (rate > 0.8) return "#a0c8a0";
  if (rate > 0.5) return "#d8c090";
  return "#e0a080";
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
  gap: "0.6rem",
  padding: "0.45rem 0.75rem 0.45rem 2.5rem",
  borderBottom: "1px solid #ffffff03",
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
  color: "#a0a8b8",
};

const chipStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.6rem",
  padding: "0.15rem 0.45rem",
  borderRadius: "3px",
  background: "#ffffff08",
  color: "#8890a0",
  whiteSpace: "nowrap",
};

const blockedBadge: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.48rem",
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

function ArmRow({ arm }: { arm: DashboardArmEntry }) {
  const sr = arm.successRate ?? (arm.totalTests && arm.totalTests > 0 ? (arm.successCount ?? 0) / arm.totalTests : undefined);
  const hasTests = arm.totalTests != null && arm.totalTests > 0;
  const srColor = sr != null ? successRateColor(sr) : "#667080";
  const label = [arm.trackName, arm.regionName].filter(Boolean).join(" · ") || arm.armId;

  return (
    <div style={armRowStyle}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" }}>
        {label}
      </span>

      {hasTests && sr != null && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "80px", flexShrink: 0 }}>
          <MiniBar value={sr} color={srColor} />
          <span style={{ color: srColor, fontSize: "0.5rem", minWidth: "28px", textAlign: "right" }}>
            {Math.round(sr * 100)}%
          </span>
        </div>
      )}

      {hasTests && (
        <span style={{ ...chipStyle, fontSize: "0.48rem" }}>
          {arm.totalTests} tests
        </span>
      )}

      {arm.selectionProbability != null && (
        <span title="Selection probability — the chance the bandit picks this arm for the next request" style={{ ...chipStyle, fontSize: "0.48rem", cursor: "help" }}>
          select {Math.round(arm.selectionProbability * 100)}%
        </span>
      )}

      {arm.routeCount != null && (
        <span title="Number of active VPS/proxy routes available in this arm" style={{ ...chipStyle, fontSize: "0.48rem", cursor: "help" }}>
          {arm.routeCount} route{arm.routeCount !== 1 ? "s" : ""}
        </span>
      )}

      {arm.blocked && (
        <span title="This arm is blocked — the censor is detecting and disrupting connections using this protocol+region combination. The bandit will shift traffic to other arms." style={{ ...blockedBadge, cursor: "help" }}>blocked</span>
      )}
    </div>
  );
}

function ISPSection({ asn, country, expandedASNs, toggleASN, asnDB }: { asn: DashboardASN; country: string; expandedASNs: Set<string>; toggleASN: (key: string) => void; asnDB: Record<string, string> | null }) {
  const key = `${country}-${asn.asn}`;
  const expanded = expandedASNs.has(key);
  const name = asnDisplayName(asn.asn, asnDB);
  const blockedColor = asn.numBlocked > 0 ? "#e06060" : "#667080";

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
          <span style={chipStyle}>{asn.numArms} arms</span>
          <span title="Arms blocked by censors vs total arms available. Blocked arms are protocol+region pairs that the censor is actively disrupting." style={{ ...chipStyle, color: blockedColor, cursor: "help" }}>
            {asn.numBlocked}/{asn.numArms} blocked
          </span>
          <span style={chipStyle}>{asn.totalPulls.toLocaleString()} pulls</span>
        </span>
      </div>
      {expanded && asn.topArms && asn.topArms.length > 0 && (
        <div>
          {asn.topArms.map((arm) => (
            <ArmRow key={arm.armId} arm={arm} />
          ))}
        </div>
      )}
    </div>
  );
}

function BanditArmsOverview({ countries }: BanditArmsOverviewProps) {
  const asnDB = useASNNames();
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedASNs, setExpandedASNs] = useState<Set<string>>(new Set());
  const [asnCache, setAsnCache] = useState<Map<string, DashboardASN[]>>(new Map());
  const [loadingCountries, setLoadingCountries] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...countries].sort((a, b) => b.asnCount - a.asnCount),
    [countries],
  );

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

  // Pre-fetch ASN data for all countries on mount for accurate counts
  useEffect(() => {
    for (const c of countries) {
      if (!asnCache.has(c.country)) {
        fetchASNs(c.country)
          .then((data) => setAsnCache((prev) => new Map(prev).set(c.country, data)))
          .catch(() => {});
      }
    }
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

    if (!asnCache.has(countryCode) && !loadingCountries.has(countryCode)) {
      setLoadingCountries((prev) => new Set(prev).add(countryCode));
      try {
        const data = await fetchASNs(countryCode);
        setAsnCache((prev) => new Map(prev).set(countryCode, data));
      } catch {
        setAsnCache((prev) => new Map(prev).set(countryCode, []));
      } finally {
        setLoadingCountries((prev) => {
          const next = new Set(prev);
          next.delete(countryCode);
          return next;
        });
      }
    }
  }, [asnCache, loadingCountries]);

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
        No bandit data available
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem", background: "var(--bg-card)" }}>
      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        <div style={card} title="Countries where the EXP3.S multi-armed bandit is actively routing traffic through tested proxy arms.">
          <div style={cardLabel}>Countries</div>
          <div style={{ ...cardValue, color: "#00e5c8" }}>{countries.length}</div>
          <div style={cardHint}>with active bandit routing</div>
        </div>
        <div style={card} title="Total number of Autonomous Systems (ISPs/network operators) with active bandit state. Each ASN has its own EXP3.S weight vector.">
          <div style={cardLabel}>Total ASNs</div>
          <div style={{ ...cardValue, color: "#c0c8d4" }}>{totalASNs}</div>
          <div style={cardHint}>ISPs / network operators being served</div>
        </div>
        <div style={card} title="Average fraction of arms (region+protocol pairs) that are currently blocked by censors across all ISPs. Lower is better.">
          <div style={cardLabel}>Avg Block Rate</div>
          <div style={{ ...cardValue, color: blockRateColor(weightedBlockRate) }}>
            {weightedBlockRate < 0.01 ? (weightedBlockRate * 100).toFixed(2) : (weightedBlockRate * 100).toFixed(1)}%
          </div>
          <div style={cardHint}>of arms blocked by censors</div>
        </div>
        <div style={card} title={"Shannon entropy of the EXP3.S weight distribution. Range: 0 (all traffic on one arm) to log₂(N) where N=number of arms. Higher entropy means the bandit is still exploring; lower means it has converged on the best-performing arms."}>
          <div style={cardLabel}>Avg Entropy</div>
          <div style={{ ...cardValue, color: "#a0b0c8" }}>
            {weightedEntropy.toFixed(3)}
          </div>
          <div style={cardHint}>0 = fully converged · ~{Math.log2(Math.max(2, totalASNs)).toFixed(1)} = uniform exploration</div>
        </div>
      </div>

      {/* Country list */}
      <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid #ffffff08", overflow: "auto", flex: 1 }}>
        {sorted.map((c) => {
          const expanded = expandedCountries.has(c.country);
          const loading = loadingCountries.has(c.country);
          const asns = asnCache.get(c.country);
          const brColor = blockRateColor(c.avgBlockRate);

          return (
            <div key={c.country}>
              {/* Country header */}
              <div
                style={countryHeaderStyle}
                onClick={() => toggleCountry(c.country)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.015)"; }}
              >
                <span style={chevronStyle(expanded)}>&#9662;</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", fontWeight: 700, color: "#00e5c8" }}>
                  {countryName(c.country)}
                </span>
                <span style={chipStyle}>{asns ? asns.length : c.asnCount} ASN{(asns ? asns.length : c.asnCount) !== 1 ? "s" : ""}</span>

                <div title="Fraction of arms blocked by censors for this country" style={{ display: "flex", alignItems: "center", gap: "4px", width: "90px", cursor: "help" }}>
                  <MiniBar value={c.avgBlockRate} color={brColor} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: brColor, minWidth: "36px", textAlign: "right" }}>
                    {c.avgBlockRate < 0.01 ? (c.avgBlockRate * 100).toFixed(2) : (c.avgBlockRate * 100).toFixed(1)}%
                  </span>
                </div>

                <span
                  title="Shannon entropy of weight distribution. 0 = converged on one arm. Higher = more exploration."
                  style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#8890a0", cursor: "help" }}
                >
                  entropy {c.avgEntropy.toFixed(3)}
                </span>
              </div>

              {/* Expanded ISP list */}
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
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(BanditArmsOverview);
