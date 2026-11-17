"use client";
import { useEffect, useMemo, useState } from "react";

const SEGMENTS = {
  core: "Core agent sandboxes", runtime: "Sandbox runtimes", local: "Local / on-device", unified: "Unified sandbox SDKs",
  dev: "Dev environments", gpu: "GPU sandboxes", platform: "Agent platforms", browser: "Browser sandboxes", computer: "Computer-use",
};
const fmt = (n) => (n === null || n === undefined || n === "" ? "–" : Number(n).toLocaleString("en-US"));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const handle = (u) => (u || "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "@").replace(/\/$/, "");
const ago = (d) => (d === null || d === undefined || d === "" ? "–" : d === 0 ? "today" : `${d}d ago`);

const SORTS = {
  score: (a, b) => b.score - a.score,
  stars: (a, b) => (b.stars || 0) - (a.stars || 0),
  push: (a, b) => (a.last_push_days ?? 9999) - (b.last_push_days ?? 9999),
  discord: (a, b) => (b.discord_online || 0) - (a.discord_online || 0),
  name: (a, b) => a.name.localeCompare(b.name),
};

export default function Radar() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("directory");
  const [q, setQ] = useState("");
  const [rel, setRel] = useState("core");
  const [seg, setSeg] = useState("");
  const [oss, setOss] = useState("");
  const [only, setOnly] = useState({ hiring: false, founding: false, discord: false, contact: false, active: false });
  const [sort, setSort] = useState("score");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetch("/data.json", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr("Could not load data.json"));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.companies
      .filter((c) => !rel || c.relevance === rel)
      .filter((c) => !seg || c.segment === seg)
      .filter((c) => !oss || (oss === "open" ? c.oss.startsWith("Open") : !c.oss.startsWith("Open")))
      .filter((c) => !only.hiring || c.open_roles.length)
      .filter((c) => !only.founding || c.founding_roles.length)
      .filter((c) => !only.discord || c.discord)
      .filter((c) => !only.contact || c.people.some((p) => p.x || p.linkedin))
      .filter((c) => !only.active || (c.last_push_days !== null && c.last_push_days <= 14))
      .filter((c) => !needle || [c.name, c.website, c.repo, c.note, ...c.people.map((p) => p.name)].join(" ").toLowerCase().includes(needle))
      .sort(SORTS[sort]);
  }, [data, q, rel, seg, oss, only, sort]);

  if (err) return <div className="wrap empty">{err}</div>;
  if (!data) return <div className="wrap empty">Loading…</div>;
  const s = data.stats;
  const flip = (k) => setOnly({ ...only, [k]: !only[k] });

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1>Sandbox Radar</h1>
          <p>{fmt(s.companies)} AI sandbox startups: what they ship, where their community lives, who runs them.</p>
        </div>
        <div className="updated"><span className="dot" />Updated {new Date(data.generated_at).toLocaleString()} · refreshes every 6h</div>
      </div>

      <div className="stats">
        <div className="stat"><b>{fmt(s.core)}</b><span>core sandbox startups</span></div>
        <div className="stat"><b>{fmt(s.open_source)}</b><span>open source</span></div>
        <div className="stat"><b>{fmt(s.discord)}</b><span>public Discords</span></div>
        <div className="stat"><b>{fmt(s.with_contact)}</b><span>with founder X / LinkedIn</span></div>
        <div className="stat"><b>{fmt(s.hiring)}</b><span>hiring now</span></div>
        <div className="stat"><b>{fmt(s.founding)}</b><span>founding-engineer roles</span></div>
      </div>

      <div className="tabs">
        {[["directory", "Directory"], ["activity", "Latest activity"], ["communities", "Communities"], ["people", "People"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "directory" && (
        <>
          <div className="filters">
            <input type="search" placeholder="Search company, founder, repo…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={rel} onChange={(e) => { setRel(e.target.value); setSeg(""); }}>
              <option value="core">Core sandbox infra</option>
              <option value="adjacent">Adjacent (platforms, browser, computer-use)</option>
              <option value="">All</option>
            </select>
            <select value={seg} onChange={(e) => setSeg(e.target.value)}>
              <option value="">All segments</option>
              {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={oss} onChange={(e) => setOss(e.target.value)}>
              <option value="">Open + closed</option><option value="open">Open source</option><option value="closed">Closed</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="score">Sort: opportunity</option><option value="stars">Sort: GitHub stars</option>
              <option value="push">Sort: last push</option><option value="discord">Sort: Discord online</option><option value="name">Sort: name</option>
            </select>
            {[["hiring", "Hiring"], ["founding", "Founding role"], ["discord", "Has Discord"], ["contact", "Founder contact"], ["active", "Pushed ≤14d"]].map(([k, l]) => (
              <label key={k} className="toggle"><input type="checkbox" checked={only[k]} onChange={() => flip(k)} />{l}</label>
            ))}
          </div>
          <p className="count">{rows.length} startups</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Company</th><th>Segment</th><th>Open source</th><th>Last push</th><th>Community</th><th>Founders</th><th>Hiring</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="row" onClick={() => setOpen(c)}>
                    <td><b>{c.name}</b><div className="sub">{host(c.website)}{c.yc_batch ? ` · YC ${c.yc_batch}` : ""}</div></td>
                    <td><span className="sub">{SEGMENTS[c.segment] || c.segment}</span><div className="sub">{c.isolation}</div></td>
                    <td className="num">{c.repo ? <>★ {fmt(c.stars)}{c.stars_gained ? <span className="chip good">+{c.stars_gained}</span> : null}<div className="sub">{c.language}</div></> : <span className="sub">{c.oss}</span>}</td>
                    <td className="num">{ago(c.last_push_days)}</td>
                    <td>{c.discord ? <span className="chip acc">Discord {fmt(c.discord_members)}{c.discord_online_pct ? ` · ${c.discord_online_pct}% on` : ""}</span> : null}{c.slack ? <span className="chip">Slack</span> : null}{c.company_x ? <span className="chip">X</span> : null}</td>
                    <td>{c.people.slice(0, 2).map((p) => <div key={p.name}>{p.name}{p.x || p.linkedin ? " ✓" : ""}</div>)}{c.people.length > 2 ? <div className="sub">+{c.people.length - 2} more</div> : null}</td>
                    <td>{c.founding_roles.length ? <span className="chip good">Founding</span> : c.open_roles.length ? <span className="chip warn">{c.open_roles.length} roles</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty">No startups match these filters.</div>}
          </div>
        </>
      )}

      {tab === "activity" && (
        <ul className="feed">
          {data.activity.length ? data.activity.map((a, i) => (
            <li key={i}><span className="chip acc">{a.type}</span><b>{a.company}</b> · <span className="sub">{a.date}</span><div>{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.text}</a> : a.text}</div></li>
          )) : <div className="empty">The first monitor cycle is still running; activity appears after it finishes.</div>}
        </ul>
      )}

      {tab === "communities" && (
        <div className="tablewrap"><table>
          <thead><tr><th>Company</th><th>Discord members</th><th>Online now</th><th>Online %</th><th>Links</th></tr></thead>
          <tbody>{data.companies.filter((c) => c.discord_members).sort((a, b) => (b.discord_online_pct || 0) - (a.discord_online_pct || 0)).map((c) => (
            <tr key={c.id} className="row" onClick={() => setOpen(c)}>
              <td><b>{c.name}</b></td><td className="num">{fmt(c.discord_members)}</td><td className="num">{fmt(c.discord_online)}</td>
              <td className="num">{c.discord_online_pct}%</td>
              <td className="links" onClick={(e) => e.stopPropagation()}><a href={c.discord} target="_blank" rel="noreferrer">Discord</a>{c.slack ? <a href={c.slack} target="_blank" rel="noreferrer">Slack</a> : null}{c.company_x ? <a href={c.company_x} target="_blank" rel="noreferrer">{handle(c.company_x)}</a> : null}</td>
            </tr>))}</tbody>
        </table></div>
      )}

      {tab === "people" && (
        <div className="tablewrap"><table>
          <thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Links</th><th>Source</th></tr></thead>
          <tbody>{data.companies.flatMap((c) => c.people.map((p) => ({ ...p, c }))).filter((p) => p.x || p.linkedin).map((p, i) => (
            <tr key={i} className="row" onClick={() => setOpen(p.c)}>
              <td><b>{p.name}</b></td><td>{p.c.name}</td><td className="sub">{p.role}</td>
              <td className="links" onClick={(e) => e.stopPropagation()}>{p.x ? <a href={p.x} target="_blank" rel="noreferrer">{handle(p.x)}</a> : null}{p.linkedin ? <a href={p.linkedin} target="_blank" rel="noreferrer">LinkedIn</a> : null}{p.github ? <a href={p.github} target="_blank" rel="noreferrer">GitHub</a> : null}</td>
              <td><span className={`chip ${p.confidence === "high" ? "good" : p.confidence === "low" ? "warn" : ""}`}>{p.source}</span></td>
            </tr>))}</tbody>
        </table></div>
      )}

      {open && <Detail c={open} onClose={() => setOpen(null)} />}
      <p className="foot">Data is scraped from public company sites, GitHub, Y Combinator, Discord invite counts and Hacker News. Founder links come from YC profiles (high confidence) or top GitHub maintainers (medium). Verify before reaching out.</p>
    </div>
  );
}

function Detail({ c, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const L = (href, label) => (href ? <a href={href} target="_blank" rel="noreferrer">{label}</a> : null);
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={c.name}>
        <button className="close" onClick={onClose}>Close</button>
        <h2>{c.name}</h2>
        <div className="links">{L(c.website, host(c.website))}{L(c.repo, "GitHub")}{L(c.company_x, handle(c.company_x))}{L(c.company_linkedin, "LinkedIn")}{L(c.discord, "Discord")}{L(c.slack, "Slack")}{L(c.careers, "Careers")}</div>
        {c.note ? <p className="sub">{c.note}</p> : null}

        <h3>Reach out</h3>
        <div className="plan"><b>{c.lane}</b><div>Best channel: {c.channel}</div>{c.hook ? <div className="sub">Opening hook: {c.hook}</div> : null}{c.emails.length ? <div className="sub">Email: {c.emails.join(", ")}</div> : null}</div>

        <h3>Founders &amp; maintainers</h3>
        {c.people.length ? c.people.map((p) => (
          <div className="person" key={p.name}><b>{p.name}</b> <span className="sub">· {p.role}</span>
            <div className="links">{L(p.x, handle(p.x))}{L(p.linkedin, "LinkedIn")}{L(p.github, "GitHub")}</div>
            <span className={`chip ${p.confidence === "high" ? "good" : p.confidence === "low" ? "warn" : ""}`}>{p.source}</span>
          </div>)) : <p className="sub">No founder found yet.</p>}

        <h3>Company</h3>
        <div className="kv">
          <div>Segment</div><div>{SEGMENTS[c.segment] || c.segment} ({c.relevance})</div>
          <div>Isolation</div><div>{c.isolation || "–"}</div>
          <div>Source</div><div>{c.oss}</div>
          <div>Stars / forks</div><div>{fmt(c.stars)} / {fmt(c.forks)}{c.stars_gained ? ` (+${c.stars_gained} last cycle)` : ""}</div>
          <div>Last push</div><div>{ago(c.last_push_days)}</div>
          <div>Language / license</div><div>{c.language || "–"} / {c.license || "–"}</div>
          <div>Discord</div><div>{c.discord_members ? `${fmt(c.discord_members)} members, ${fmt(c.discord_online)} online (${c.discord_online_pct}%)` : "–"}</div>
          <div>YC batch</div><div>{c.yc_batch || "–"}</div>
          <div>Team / HQ</div><div>{c.team_size || "–"} / {c.hq || "–"}</div>
        </div>

        {c.open_roles.length ? <><h3>Open roles</h3>{c.open_roles.map((r) => <span key={r} className={`chip ${/founding/i.test(r) ? "good" : ""}`}>{r}</span>)}</> : null}
        {c.building.length ? <><h3>What they're building (recent commits)</h3><ul>{c.building.map((b, i) => <li key={i}>{b}</li>)}</ul></> : null}
        {c.news.length ? <><h3>News</h3><ul>{c.news.map((n, i) => <li key={i}>{n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.text}</a> : n.text} <span className="sub">{n.date}</span></li>)}</ul></> : null}
      </aside>
    </>
  );
}
