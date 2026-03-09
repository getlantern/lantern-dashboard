import type { VolunteerStats } from "../data/mock";

const RANK_LABELS: Record<VolunteerStats["rank"], string> = {
  ember: "Ember",
  spark: "Spark",
  flame: "Flame",
  beacon: "Beacon",
  lighthouse: "Lighthouse",
};

const COUNTRY_NAMES: Record<string, string> = {
  IR: "Iran",
  CN: "China",
  RU: "Russia",
  MM: "Myanmar",
  BY: "Belarus",
  TM: "Turkmenistan",
  VN: "Vietnam",
  CU: "Cuba",
  AE: "U.A.E.",
  SA: "Saudi Arabia",
  PK: "Pakistan",
  UZ: "Uzbekistan",
  TH: "Thailand",
};

export default function ImpactCard({ stats }: { stats: VolunteerStats }) {
  return (
    <div className="impact-card">
      <div className="impact-header">
        <h3>Your Impact</h3>
        <span className="rank-badge">{RANK_LABELS[stats.rank]}</span>
      </div>

      <div className="impact-stats">
        <div className="impact-stat">
          <span className="impact-stat-value mono">{stats.peersHelpedToday}</span>
          <span className="impact-stat-label">Peers helped today</span>
        </div>
        <div className="impact-stat">
          <span className="impact-stat-value mono">{stats.sessionsProxied.toLocaleString()}</span>
          <span className="impact-stat-label">Total sessions</span>
        </div>
        <div className="impact-stat">
          <span className="impact-stat-value mono">{stats.bandwidthSharedGB.toFixed(1)}</span>
          <span className="impact-stat-label">GB shared</span>
        </div>
        <div className="impact-stat">
          <span className="impact-stat-value mono">{stats.uptimeHours.toLocaleString()}</span>
          <span className="impact-stat-label">Hours online</span>
        </div>
      </div>

      <div className="streak-bar">
        <span className="streak-fire">🔥</span>
        <span>
          <span className="streak-count">{stats.streak}-day</span> streak
        </span>
      </div>

      <div>
        <span
          className="mono"
          style={{
            fontSize: "0.6rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Countries Reached
        </span>
        <div className="countries-helped" style={{ marginTop: "0.35rem" }}>
          {stats.countriesHelped.map((code) => (
            <span key={code} className="country-tag">
              {COUNTRY_NAMES[code] || code}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
