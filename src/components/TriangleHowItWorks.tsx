// The Triangle tab: how a VPS acts as a triangle frontend. A bandit VPS holds
// the client-facing IP but runs no proxy; it rewrites one port and tunnels the
// client's packets over IPv6 FoU to a sing-box container on a PATH phost,
// which answers the client directly with the VPS's IP as the source.
//
// Addresses below are the first production route's (track
// ss2022-triangle-alicloud-us1-us-free, VPS route 0b4f584a, backend route
// c1620a77 on phost-path-eu1-l7j2) and change per route. Kept in sync with
// cmd/api/vps/triangle.go, cmd/api/jobs/vps_triangle_frontend.go and
// cmd/phost/networking_linux.go in lantern-cloud.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { fetchSigNozMetrics } from "../api/client";
import { card, mono, muted, sectionLabel, td, th } from "./overlayStyles";

const UP = "#00e5c8"; // client -> frontend -> backend: the only bytes that cross Alicloud
const DOWN = "#ffb432"; // backend -> client with the frontend's IP as source: never crosses Alicloud
const TEXT = "#c0c8d4";
const DIM = "#8090a0";
const LINE = "#ffffff14";
const BOX = "rgba(255,255,255,0.025)";
const ROW = "rgba(255,255,255,0.045)";

const DEFAULT_TRACK = "ss2022-triangle-alicloud-us1-us-free";

const prose: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.75rem",
  color: "#8090a0",
  lineHeight: 1.65,
};

const heading: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#c0c8d4",
  marginBottom: "0.4rem",
};

const code: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  color: "#c0c8d4",
};

const figureWrap: CSSProperties = {
  overflowX: "auto",
  margin: "0.5rem 0",
};

function C({ children }: { children: ReactNode }) {
  return <span style={code}>{children}</span>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={card}>
      <div style={heading}>{title}</div>
      {children}
    </div>
  );
}

// SVG text helpers so the figures stay readable as JSX.
function Txt({ x, y, children, mono: isMono, dim, bold, size, anchor, color }: {
  x: number; y: number; children: ReactNode; mono?: boolean; dim?: boolean; bold?: boolean;
  size?: number; anchor?: "start" | "middle" | "end"; color?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor ?? "start"}
      fill={color ?? (dim ? DIM : TEXT)}
      fontFamily={isMono ? "var(--font-mono)" : "var(--font-sans)"}
      fontSize={size ?? (isMono ? 11 : 12)}
      fontWeight={bold ? 600 : 400}
    >
      {children}
    </text>
  );
}

function Cap({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={x} y={y} fill={DIM} fontFamily="var(--font-sans)" fontSize={10} letterSpacing="0.06em">
      {children}
    </text>
  );
}

function Badge({ x, y, n, color }: { x: number; y: number; n: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={10} fill={color} />
      <text x={x} y={y + 4} textAnchor="middle" fill="#0a0e18" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700}>
        {n}
      </text>
    </g>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "grid", gap: "0.15rem", minWidth: 0 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", fontWeight: 600, color: UP, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ ...muted, maxWidth: "22rem" }}>{label}</div>
    </div>
  );
}

function PacketPath() {
  return (
    <svg
      viewBox="0 0 1240 640"
      style={{ width: "100%", minWidth: "900px", display: "block" }}
      role="img"
      aria-label="A client connects to 47.85.90.144:443 on an Alicloud VPS. Alicloud NATs it to the VM's private 172.16.0.3; an untracked nft rule rewrites it back to 47.85.90.144 and routes it into fou0, which wraps it in IPv6 plus UDP to the phost container's forwarding address on port 58564. The container decapsulates it, sing-box answers on port 443 and dials the destination from 163.123.193.24, and replies leave PATH directly to the client with source 47.85.90.144, never passing Alicloud."
    >
      <defs>
        <marker id="tri-up" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={UP} />
        </marker>
        <marker id="tri-down" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={DOWN} />
        </marker>
        <marker id="tri-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={DIM} />
        </marker>
      </defs>

      {/* Client */}
      <rect x={24} y={230} width={180} height={150} rx={8} fill={BOX} stroke={LINE} />
      <Cap x={40} y={254}>CLIENT</Cap>
      <Txt x={40} y={278}>Lantern 9.x / 10.x</Txt>
      <Txt x={40} y={298}>sing-box SS-2022</Txt>
      <Txt x={40} y={320} mono>→ 47.85.90.144:443</Txt>
      <Txt x={40} y={360} mono dim>seen in US, IR, MM…</Txt>

      {/* Alicloud */}
      <rect x={250} y={34} width={360} height={526} rx={10} fill="none" stroke={DIM} strokeDasharray="6,5" />
      <Cap x={268} y={58}>ALICLOUD US-EAST-1 · AS45102</Cap>
      <Txt x={268} y={76} mono dim>VPC lantern-vps · 240b:4002:185:8e00::/56</Txt>
      <rect x={270} y={92} width={320} height={44} rx={6} fill={ROW} stroke={LINE} />
      <Txt x={286} y={112}>1:1 NAT public IP</Txt>
      <Txt x={286} y={128} mono>47.85.90.144 ↔ 172.16.0.3</Txt>

      <rect x={270} y={152} width={320} height={392} rx={8} fill={BOX} stroke={LINE} />
      <Txt x={286} y={176} bold size={13}>Frontend VPS</Txt>
      <Txt x={286} y={194} mono dim>ecs.t6-c1m1.large · no proxy process</Txt>

      <rect x={286} y={208} width={284} height={48} rx={5} fill={ROW} stroke={LINE} />
      <Txt x={300} y={228} mono>eth0  172.16.0.3</Txt>
      <Txt x={300} y={246} mono dim>240b:4002:185:8e00:…:b582 (published)</Txt>

      <rect x={286} y={266} width={284} height={90} rx={5} fill="rgba(0,229,200,0.06)" stroke={UP} strokeWidth={1.2} />
      <Txt x={300} y={286} mono>nft table ip lantern_triangle</Txt>
      <Txt x={300} y={304} mono dim>prerouting · priority raw</Txt>
      <Txt x={300} y={322} mono dim>daddr 172.16.0.3, tcp|udp dport 443</Txt>
      <Txt x={300} y={340} mono dim>notrack · daddr set 47.85.90.144</Txt>

      <rect x={286} y={366} width={284} height={34} rx={5} fill={ROW} stroke={LINE} />
      <Txt x={300} y={388} mono>route 47.85.90.144/32 dev fou0</Txt>

      <rect x={286} y={410} width={284} height={70} rx={5} fill="rgba(0,229,200,0.06)" stroke={UP} strokeWidth={1.2} />
      <Txt x={300} y={430} mono>fou0 · ip6tnl mode ipip6</Txt>
      <Txt x={300} y={448} mono dim>encap fou, dport 58564, mtu 1452</Txt>
      <Txt x={300} y={466} mono dim>FORWARD -o fou0 accept · rp_filter 0</Txt>

      <Txt x={286} y={504} mono dim>unit lantern-triangle-frontend</Txt>
      <Txt x={286} y={522} mono dim>SSH :22 and otel untouched</Txt>

      {/* PATH */}
      <rect x={650} y={34} width={440} height={526} rx={10} fill="none" stroke={DIM} strokeDasharray="6,5" />
      <Cap x={668} y={58}>PATH FR07 · FRANKFURT · AS36231</Cap>
      <Txt x={668} y={76} mono dim>edge drops unsolicited IPv4 · IPv6 passes · BCP-38 off</Txt>

      <rect x={670} y={92} width={400} height={452} rx={8} fill={BOX} stroke={LINE} />
      <Txt x={686} y={116} bold size={13}>phost-path-eu1-l7j2</Txt>
      <Txt x={686} y={134} mono dim>wan0 163.123.193.24 · 2606:f240:f00:1::/48</Txt>
      <Txt x={686} y={152} mono dim>bridge phost · 2606:f240:f00:eaf1::/80</Txt>
      <Txt x={686} y={170} mono dim>host NAT masquerades only 172.16.0.0/12</Txt>

      <rect x={686} y={186} width={368} height={262} rx={8} fill={BOX} stroke={LINE} />
      <Cap x={702} y={208}>CONTAINER phost-proxy-c1620a77</Cap>
      <Txt x={702} y={226} mono dim>image sing-box (lantern-box) · own netns</Txt>

      <rect x={702} y={240} width={320} height={40} rx={5} fill="rgba(0,229,200,0.06)" stroke={UP} strokeWidth={1.2} />
      <Txt x={716} y={264} mono>eth0 2606:f240:f00:eaf1:0:8b83:98e5:b516</Txt>

      <rect x={702} y={290} width={320} height={50} rx={5} fill={ROW} stroke={LINE} />
      <Txt x={716} y={310} mono>fou6 :58564 → ip6tnl0 (ipip6)</Txt>
      <Txt x={716} y={328} mono dim>rp_filter 0 · ip_forward 1</Txt>

      <rect x={702} y={350} width={320} height={34} rx={5} fill={ROW} stroke={LINE} />
      <Txt x={716} y={372} mono>lo  47.85.90.144/32</Txt>

      <rect x={702} y={394} width={320} height={46} rx={5} fill="rgba(0,229,200,0.06)" stroke={UP} strokeWidth={1.2} />
      <Txt x={716} y={414} mono>sing-box shadowsocks-in :443</Txt>
      <Txt x={716} y={432} mono dim>2022-blake3 · AdvMSS 1412 = mtu − 88</Txt>

      <Txt x={686} y={474} mono dim>phost polls /proxy/phost/sync every 30 s ±20%</Txt>
      <Txt x={686} y={492} mono dim>tunnel state lives in the container netns,</Txt>
      <Txt x={686} y={510} mono dim>so removing the route removes all of it</Txt>

      {/* Destinations */}
      <rect x={1120} y={248} width={104} height={110} rx={8} fill={BOX} stroke={LINE} />
      <Cap x={1134} y={272}>DESTINATIONS</Cap>
      <Txt x={1134} y={296}>see exit IP</Txt>
      <Txt x={1134} y={318} mono>163.123.</Txt>
      <Txt x={1134} y={336} mono>193.24</Txt>

      {/* 1: client -> NAT */}
      <path d="M204,262 L234,262 L234,114 L268,114" fill="none" stroke={UP} strokeWidth={2} markerEnd="url(#tri-up)" />
      <Badge x={234} y={190} n={1} color={UP} />
      {/* 2: NAT -> eth0 */}
      <path d="M430,136 L430,206" fill="none" stroke={UP} strokeWidth={2} markerEnd="url(#tri-up)" />
      <Badge x={452} y={172} n={2} color={UP} />
      {/* 3: eth0 -> nft -> route -> fou0 */}
      <path d="M580,232 L580,440 L572,440" fill="none" stroke={UP} strokeWidth={2} markerEnd="url(#tri-up)" />
      <Badge x={580} y={320} n={3} color={UP} />
      {/* 4: fou0 -> container eth0 over IPv6 */}
      <path d="M570,470 C640,470 620,260 700,260" fill="none" stroke={UP} strokeWidth={2.8} strokeDasharray="9,5" markerEnd="url(#tri-up)" />
      <Badge x={630} y={368} n={4} color={UP} />
      {/* 5: decap chain inside the container */}
      <path d="M1036,262 L1036,416 L1024,416" fill="none" stroke={UP} strokeWidth={2} markerEnd="url(#tri-up)" />
      <Badge x={1036} y={340} n={5} color={UP} />
      {/* 6: sing-box -> destinations */}
      <path d="M1054,300 L1118,300" fill="none" stroke={DIM} strokeWidth={1.6} markerEnd="url(#tri-dim)" />
      <Badge x={1092} y={282} n={6} color={UP} />
      {/* 7: reply straight back to the client, spoofed as the frontend */}
      <path d="M862,440 L862,592 L114,592 L114,384" fill="none" stroke={DOWN} strokeWidth={3} markerEnd="url(#tri-down)" />
      <Badge x={500} y={592} n={7} color={DOWN} />
      <Txt x={522} y={616} mono dim>src 47.85.90.144 → client · leaves PATH wan0 · never touches Alicloud</Txt>
    </svg>
  );
}

const STEPS: Array<{ n: number; reply?: boolean; body: ReactNode }> = [
  { n: 1, body: <>The client opens TCP (or UDP) to <C>47.85.90.144:443</C>, the address and Shadowsocks-2022 key in its bandit config.</> },
  { n: 2, body: <>Alicloud's 1:1 NAT delivers it addressed to the VM's private <C>172.16.0.3</C>.</> },
  { n: 3, body: <>In the <C>raw</C> prerouting hook, before connection tracking, one nft rule matches only that address and port 443, marks it <C>notrack</C>, and rewrites the destination back to <C>47.85.90.144</C>. The route <C>47.85.90.144/32 dev fou0</C> forwards it into the tunnel. SSH, the metrics agent and everything else on the box never match.</> },
  { n: 4, body: <><C>fou0</C> wraps the untouched IPv4 packet in IPv6 + UDP to the backend route's forwarding address <C>[2606:f240:f00:eaf1:0:8b83:98e5:b516]:58564</C>, which the API picked inside the phost's <C>/80</C>. PATH's edge drops unsolicited IPv4 of every kind but passes this IPv6.</> },
  { n: 5, body: <>Inside the container's network namespace, the FoU listener on <C>:58564</C> strips the outer headers into <C>ip6tnl0</C> (ipip6). The inner destination <C>47.85.90.144</C> is on <C>lo</C>, so sing-box accepts it on <C>:443</C> and sees the client's real source address.</> },
  { n: 6, body: <>sing-box dials the destination from the PATH host's own address <C>163.123.193.24</C> (AS36231, Tempest/PATH). That is the exit IP the user sees.</> },
  { n: 7, reply: true, body: <>Replies keep source <C>47.85.90.144</C>. Docker's masquerade is disabled on the phost bridge and the host only masquerades <C>172.16.0.0/12</C>, so they leave <C>wan0</C> unchanged, and PATH doesn't filter spoofed sources. The client sees an ordinary connection to the address it dialled. In production, a 30.0 MB download produced 30.16 MB of these packets on PATH's <C>wan0</C>.</> },
];

function Steps() {
  return (
    <ol style={{ listStyle: "none", display: "grid", gap: "0.5rem", marginTop: "0.6rem" }}>
      {STEPS.map((s) => (
        <li key={s.n} style={{ display: "grid", gridTemplateColumns: "1.6rem 1fr", gap: "0.5rem", alignItems: "start" }}>
          <span style={{
            display: "grid", placeItems: "center", width: "1.3rem", height: "1.3rem", borderRadius: "50%",
            background: s.reply ? DOWN : UP, color: "#0a0e18", fontFamily: "var(--font-mono)", fontSize: "0.65rem", fontWeight: 700,
          }}>{s.n}</span>
          <div style={{ ...prose, minWidth: 0 }}>{s.body}</div>
        </li>
      ))}
    </ol>
  );
}

function OnTheWire() {
  return (
    <svg
      viewBox="0 0 1000 250"
      style={{ width: "100%", minWidth: "900px", display: "block" }}
      role="img"
      aria-label="A 1500-byte tunnel packet: 40 bytes of outer IPv6 and 8 bytes of UDP added by fou0, then the client's original IPv4 packet of at most 1452 bytes, which is fou0's MTU, carrying TCP to port 443 with at most 1412 bytes of payload, the AdvMSS the container advertises."
    >
      <Cap x={20} y={34}>ADDED BY FOU0 · STRIPPED BY FOU6 IN THE CONTAINER</Cap>
      <path d="M20,44 L20,52 L268,52 L268,44" fill="none" stroke={DIM} strokeWidth={1.4} />
      <Cap x={290} y={34}>THE CLIENT'S PACKET, UNCHANGED · ≤ 1452 B = FOU0 MTU</Cap>
      <path d="M290,44 L290,52 L980,52 L980,44" fill="none" stroke={DIM} strokeWidth={1.4} />

      <rect x={20} y={64} width={190} height={64} fill="rgba(0,229,200,0.14)" stroke={UP} />
      <Txt x={34} y={90} bold>IPv6 · 40 B</Txt>
      <Txt x={34} y={110} mono dim>next header UDP</Txt>
      <rect x={210} y={64} width={58} height={64} fill="rgba(0,229,200,0.14)" stroke={UP} />
      <Txt x={220} y={90} bold>UDP</Txt>
      <Txt x={220} y={110} mono dim>8 B</Txt>
      <rect x={290} y={64} width={150} height={64} fill={BOX} stroke={TEXT} />
      <Txt x={304} y={90} bold>IPv4 · 20 B</Txt>
      <Txt x={304} y={110} mono dim>proto TCP</Txt>
      <rect x={440} y={64} width={130} height={64} fill={BOX} stroke={TEXT} />
      <Txt x={454} y={90} bold>TCP · 20+ B</Txt>
      <Txt x={454} y={110} mono dim>dport 443</Txt>
      <rect x={570} y={64} width={410} height={64} fill={ROW} stroke={LINE} />
      <Txt x={584} y={90} bold>payload ≤ 1412 B</Txt>
      <Txt x={584} y={110} mono dim>Shadowsocks-2022 AEAD stream</Txt>

      <Txt x={20} y={154} mono>src 240b:4002:185:8e00:…:b582</Txt>
      <Txt x={20} y={172} mono>dst 2606:f240:f00:eaf1:0:8b83:98e5:b516</Txt>
      <Txt x={20} y={198} mono>sport auto · dport 58564</Txt>
      <Txt x={290} y={154} mono>src client's real IP</Txt>
      <Txt x={290} y={172} mono>dst 47.85.90.144 (rewritten back from 172.16.0.3)</Txt>
      <Txt x={584} y={198} mono>MSS clamp: container default route AdvMSS = 1500 − 88</Txt>
      <Txt x={20} y={232} mono dim>48 B of tunnel overhead + 1452 B inner = 1500 B on the wire. Phost lowers the advertised MSS so TCP never sends a segment that would need fragmenting.</Txt>
    </svg>
  );
}

// The provision → serve → teardown sequence, as a swimlane list: each row is
// one call, attributed to the component that makes it.
const LIFECYCLE: Array<{ phase: string; rows: Array<[string, ReactNode]> }> = [
  {
    phase: "Provision",
    rows: [
      ["Pool worker", <>inserts a <C>vps_routes</C> row, status pending</>],
      ["Provision worker → Alicloud", <><C>ensureNetworking</C>: IPv6 on the VPC and VSwitch, IPv6 gateway</>],
      ["Provision worker → Alicloud", <><C>RunInstances</C> with <C>Ipv6AddressCount 1</C>, tagged <C>lantern-ipv6</C></>],
      ["Provision worker → Alicloud", <><C>PublishIPv6</C> via <C>AllocateIpv6InternetBandwidth</C></>],
      ["Provision worker → API DB", <><C>proxyroute.CreateTx</C>: backend <C>proxy_routes</C> row on a TRIANGLE phost in eu1, forwarding address and port in its /80</>],
      ["Provision worker → API DB", <><C>SetVPSRouteBackendRoute</C> links the two rows</>],
      ["phost l7j2", <>polls <C>/proxy/phost/sync</C> every 30 s, starts the sing-box container, runs <C>setupTriangleTunnel</C>: fou6, <C>ip6tnl0</C>, <C>lo</C> address, AdvMSS</>],
      ["Provision worker → VM", <>over SSH via the bastion, installs the <C>lantern-triangle-frontend</C> unit</>],
      ["Provision worker → VM", <>probes reachability through the whole triangle</>],
      ["Provision worker → API DB", <><C>UpdateVPSRouteRunning</C> with the backend's <C>launch_cfg</C></>],
    ],
  },
  {
    phase: "Serve",
    rows: [["Bandit", <>the arm becomes eligible for the track's targeted clients</>]],
  },
  {
    phase: "Teardown",
    rows: [
      ["Destroy worker → API DB", <>deletes the backend <C>proxy_routes</C> row first</>],
      ["phost l7j2", <>next sync removes the container and its netns</>],
      ["Destroy worker → Alicloud", <><C>DestroyVM</C>: releases IPv6 bandwidth, deletes the VM</>],
    ],
  },
];

// Each phase's first row number, so the steps count continuously across phases.
const LIFECYCLE_STARTS = LIFECYCLE.reduce<number[]>(
  (starts, _group, i) => [...starts, i === 0 ? 1 : starts[i - 1] + LIFECYCLE[i - 1].rows.length],
  [],
);

function Lifecycle() {
  return (
    <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.5rem" }}>
      {LIFECYCLE.map((group, gi) => (
        <div key={group.phase}>
          <div style={sectionLabel}>{group.phase}</div>
          <div style={{ display: "grid", gap: "0.3rem" }}>
            {group.rows.map(([actor, what], ri) => {
              const n = LIFECYCLE_STARTS[gi] + ri;
              return (
                <div key={n} style={{ display: "grid", gridTemplateColumns: "1.6rem minmax(9rem, 13rem) 1fr", gap: "0.6rem", alignItems: "baseline" }}>
                  <span style={{ ...mono, color: DIM }}>{n}</span>
                  <span style={{ ...mono, color: group.phase === "Teardown" ? DOWN : UP }}>{actor}</span>
                  <span style={{ ...prose, minWidth: 0 }}>{what}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BytesBar() {
  return (
    <svg
      viewBox="0 0 1000 170"
      style={{ width: "100%", minWidth: "640px", display: "block" }}
      role="img"
      aria-label="In the spike, 32.5 GB were delivered to the client from PATH while the Alicloud frontend's egress was 83 MB, 0.24 percent."
    >
      <Cap x={20} y={30}>SPIKE · 32-STREAM DOWNLOAD THROUGH ONE FRONTEND, 30 S</Cap>
      <rect x={20} y={46} width={900} height={34} rx={3} fill={DOWN} />
      <Txt x={20} y={102}>Delivered to the client from PATH: 32.5 GB (9.3 Gbit/s, PATH's 10G line rate)</Txt>
      <rect x={20} y={118} width={3} height={20} rx={1} fill={UP} />
      <Txt x={32} y={133}>Alicloud frontend egress: 83 MB, 0.24%, about 24k packets/s, mostly TCP ACKs</Txt>
      <Txt x={20} y={162} mono dim>Both bars share one scale: 900 px = 32.5 GB, so 83 MB is 2.3 px.</Txt>
    </svg>
  );
}

// ── Live traffic for one triangle track, from the metrics proxy ──

function proxyIOQuery(track: string, groupBy: string, startMs: number, endMs: number): object {
  return {
    start: startMs,
    end: endMs,
    compositeQuery: {
      queryType: "builder",
      panelType: "graph",
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateAttribute: { key: "proxy.io", dataType: "float64", type: "Sum", isColumn: true, isJSON: false },
          timeAggregation: "rate",
          spaceAggregation: "sum",
          filters: {
            items: [
              { key: { key: "proxy.track", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: track },
            ],
            op: "AND",
          },
          expression: "A",
          disabled: false,
          groupBy: [{ key: groupBy, dataType: "string", type: "tag", isColumn: false, isJSON: false }],
          legend: `{{${groupBy}}}`,
          having: [],
          limit: null,
          orderBy: [],
          reduceTo: "avg",
          stepInterval: 300,
        },
      },
    },
  };
}

// averageBySeries turns a graph response into label → mean bytes/s over the window.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function averageBySeries(resp: any, label: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const qr of resp?.data?.result || []) {
    for (const s of qr.series || []) {
      const key = s.labels?.[label] ?? "unknown";
      const vals = (s.values || []).map((v: { value: string }) => parseFloat(v.value) || 0);
      out[key] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
    }
  }
  return out;
}

function formatRate(bytesPerSec: number): string {
  const bits = bytesPerSec * 8;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(2)} Gbit/s`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(2)} Mbit/s`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(1)} kbit/s`;
  return `${bits.toFixed(0)} bit/s`;
}

function LiveTraffic() {
  const [track, setTrack] = useState(DEFAULT_TRACK);
  const [draft, setDraft] = useState(DEFAULT_TRACK);
  // Results are keyed by the track they were loaded for, so switching tracks
  // reads as loading without resetting state inside the effect.
  const [result, setResult] = useState<{
    track: string;
    byDirection?: Record<string, number>;
    byCountry?: Record<string, number>;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const endMs = Date.now();
    const startMs = endMs - 3600_000;
    Promise.all([
      fetchSigNozMetrics(proxyIOQuery(track, "network.io.direction", startMs, endMs)),
      fetchSigNozMetrics(proxyIOQuery(track, "geo.country.iso_code", startMs, endMs)),
    ])
      .then(([dir, country]) => {
        if (cancelled) return;
        setResult({
          track,
          byDirection: averageBySeries(dir, "network.io.direction"),
          byCountry: averageBySeries(country, "geo.country.iso_code"),
        });
      })
      .catch((e) => {
        if (!cancelled) setResult({ track, error: e instanceof Error ? e.message : "SigNoz query failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [track]);

  const current = result?.track === track ? result : null;
  const error = current?.error ?? null;
  const byDirection = current?.byDirection ?? null;
  const byCountry = current?.byCountry ?? null;
  const transmit = byDirection?.transmit ?? 0;
  const receive = byDirection?.receive ?? 0;
  const countries = byCountry ? Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];

  return (
    <Card title="Live: last hour on a triangle track">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTrack(draft.trim() || DEFAULT_TRACK);
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.6rem" }}
      >
        <label htmlFor="triangle-track" style={muted}>Track</label>
        <input
          id="triangle-track"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            ...mono, flex: "1 1 18rem", minWidth: 0, background: "#ffffff08", border: "1px solid #ffffff14",
            borderRadius: "var(--radius-sm)", padding: "0.3rem 0.5rem",
          }}
        />
        <button
          type="submit"
          style={{
            ...mono, background: "var(--accent-primary-dim)", color: "var(--accent-primary)", border: "1px solid #00e5c830",
            borderRadius: "var(--radius-sm)", padding: "0.3rem 0.7rem", cursor: "pointer",
          }}
        >
          Load
        </button>
      </form>
      {error ? (
        <div style={{ ...muted, color: "#ff4060" }}>Couldn't load metrics: {error}</div>
      ) : !byDirection ? (
        <div style={muted}>Loading proxy.io for {track}…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))", gap: "1rem" }}>
          <div style={{ display: "grid", gap: "0.6rem", alignContent: "start" }}>
            <Stat value={formatRate(transmit)} label="to clients, leaving PATH with the frontend's IP" />
            <Stat value={formatRate(receive)} label="from clients, the only traffic that crosses the frontend" />
            <div style={muted}>
              Frontend share of bytes: {transmit + receive > 0 ? `${((receive / (transmit + receive)) * 100).toFixed(1)}%` : "no traffic yet"}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={sectionLabel}>Traffic by client country (proxy-observed)</div>
            {countries.length === 0 ? (
              <div style={muted}>No traffic in the last hour.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr><th style={th}>Country</th><th style={{ ...th, textAlign: "right" }}>Avg rate</th></tr>
                  </thead>
                  <tbody>
                    {countries.map(([cc, rate]) => (
                      <tr key={cc}>
                        <td style={td}>{cc}</td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatRate(rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ ...muted, marginTop: "0.4rem" }}>
              Countries here come from the client's real source IP. The bandit assigns by the API's detected country, which differs for clients whose config fetch arrives through AMP.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

const CODE_MAP: Array<[string, string, string]> = [
  ["Track opt-in", "tracks.triangle_backend_region_id · migration 000137", "Set only at creation; a trigger rejects any change. A CHECK limits it to IPv4 VPS-sourced tracks."],
  ["Route link", "vps_routes.backend_route_id", "FK to proxy_routes, ON DELETE SET NULL. The destroy worker reads it to remove the backend."],
  ["Backend route", "cmd/api/proxyroute/create.go", "Picks a TRIANGLE phost in the backend region and a forwarding address and port in its /80. Each insert attempt gets its own savepoint, so a collision can be retried."],
  ["Frontend VM", "cmd/api/vps/alicloud.go", "IPv6 VPC/VSwitch/gateway, Ipv6AddressCount, publish and release IPv6 bandwidth. Looks addresses up by instance through the VPC API."],
  ["Frontend script", "cmd/api/vps/triangle.go", "Renders /usr/local/sbin/lantern-triangle-frontend and its systemd unit; output pinned by a golden test."],
  ["Provision and teardown", "cmd/api/jobs/vps_triangle_frontend.go, vps_destroy_worker.go", "Builds both halves, probes the full path, publishes the shared launch config; deletes the backend before the VM."],
  ["Backend container", "cmd/phost/networking_linux.go setupTriangleTunnel", "Unchanged for triangle frontends: FoU6 decap, ipip6 on ip6tnl0, frontend IP on lo, AdvMSS."],
  ["Monitoring", "SigNoz dashboard “Triangle Frontends”", "Throughput by direction, traffic by client country next to the API-detected country, platform mix."],
];

const CONSTRAINTS: Array<[string, ReactNode]> = [
  ["PATH only accepts IPv6 here", <>Its edge drops unsolicited IPv4 to the phost (UDP, TCP to closed ports, IP-in-IP, GRE). Every frontend therefore needs a public IPv6 address, and the tunnel always targets the phost's delegated /80.</>],
  ["Alicloud hides instance IPv6", <><C>DescribeInstances</C> leaves <C>Ipv6Sets</C> empty even when the address exists. The provider tags IPv6 instances and asks the VPC API instead (lantern-cloud #3480).</>],
  ["The API role needed IPv6 permissions", <>The shared <C>LanternCloud</C> RAM policy lacked the VPC IPv6 actions, so the first provision failed with <C>Forbidden.RAM</C> (lantern-cloud #3479).</>],
  ["Country targeting leaks through AMP", <>Clients that fetch config over AMP and can't detect their public IP arrive from Google's AS396982 and geolocate to the US; Iran's timezone header is never sent. So a US-only track carries Iranian users. That bug is separate from triangle routing.</>],
];

export default function TriangleHowItWorks() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <Card title="Triangle frontends">
        <p style={prose}>
          A bandit VPS on Alicloud holds the client-facing IP but runs no proxy. It rewrites one port, tunnels the client's
          packets over IPv6 to a sing-box container on a PATH bare-metal phost in Frankfurt, and that container answers the
          client <span style={{ color: DOWN }}>directly, with the VPS's IP as the source</span>. Only the client's{" "}
          <span style={{ color: UP }}>upload</span> ever crosses Alicloud.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem 2rem", marginTop: "0.8rem" }}>
          <Stat value="0.24%" label="of delivered bytes left through the Alicloud frontend (spike, 32.5 GB delivered)" />
          <Stat value="9.3 Gbit/s" label="through one ecs.t6-c1m1.large frontend at 1.3% softirq CPU" />
          <Stat value="77.6 s" label="first production provision, VM to reachable route" />
          <Stat value="8 of 9" label="Russian residential exits completed downloads through it" />
        </div>
      </Card>

      <Card title="One connection, end to end">
        <p style={prose}>
          Live values from the first production route: track <C>ss2022-triangle-alicloud-us1-us-free</C>, VPS route{" "}
          <C>0b4f584a</C>, backend route <C>c1620a77</C> on <C>phost-path-eu1-l7j2</C>.
        </p>
        <div style={figureWrap}><PacketPath /></div>
        <p style={prose}>
          <span style={{ color: UP }}>Teal</span> is traffic that crosses the Alicloud frontend: only what the client sends,
          plus TCP acknowledgements. <span style={{ color: DOWN }}>Amber</span> is the reply path, which leaves PATH with a
          spoofed source and is where almost every byte goes.
        </p>
        <Steps />
      </Card>

      <Card title="On the wire between Alicloud and PATH">
        <div style={figureWrap}><OnTheWire /></div>
        <p style={prose}>
          The outer header is the only thing the two providers' networks see: IPv6 from Alicloud's address space to PATH's
          delegated prefix, as plain UDP. The inner packet is byte-for-byte what the client sent, apart from the destination
          address.
        </p>
      </Card>

      <Card title="How a frontend comes and goes, with no manual steps">
        <p style={prose}>
          A track opts in at creation with <C>--triangle-backend-region eu1</C>. From then on the ordinary bandit pool drives
          everything: the pool asks for routes, the provision worker builds both halves, phost picks up its half by polling,
          and the destroy worker removes both.
        </p>
        <Lifecycle />
        <p style={{ ...prose, marginTop: "0.6rem" }}>
          If any provision step fails, the backend row is deleted and the route stays pending; the next attempt destroys the
          previous VM before creating another, so at most one VM exists per route. The client config and the container share
          one launch config, copied from the backend row, so their keys always match.
        </p>
      </Card>

      <Card title="Where the bytes leave">
        <div style={figureWrap}><BytesBar /></div>
        <p style={prose}>
          Alicloud bills outbound traffic. With a triangle frontend the expensive direction, downloads, is served from PATH's
          flat-rate link, and Alicloud only carries what clients send, which on real proxy traffic is about 4% of bytes plus
          acknowledgements.
        </p>
      </Card>

      <LiveTraffic />

      <Card title="Where each piece lives">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr><th style={th}>Piece</th><th style={th}>Where</th><th style={th}>What it does</th></tr>
            </thead>
            <tbody>
              {CODE_MAP.map(([piece, where, what]) => (
                <tr key={piece}>
                  <td style={{ ...td, color: TEXT }}>{piece}</td>
                  <td style={td}>{where}</td>
                  <td style={{ ...td, fontFamily: "var(--font-sans)", whiteSpace: "normal", minWidth: "18rem" }}>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Constraints found on the way">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "0.7rem", marginTop: "0.2rem" }}>
          {CONSTRAINTS.map(([name, description]) => (
            <div key={name} style={{ borderLeft: `2px solid ${DOWN}`, paddingLeft: "0.6rem" }}>
              <div style={{ ...code, color: DOWN }}>{name}</div>
              <div style={{ ...prose, fontSize: "0.7rem" }}>{description}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
