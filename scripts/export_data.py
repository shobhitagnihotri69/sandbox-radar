#!/usr/bin/env python3
"""Build public/data.json for Sandbox Radar from the enrichment outputs + monitor.db, optionally push it to GitHub.

Usage:
  python3 export_data.py --dir <dir with DIRECTORY.csv, PEOPLE.csv> --src <startups.csv> [--db monitor.db]
                         --out data.json [--push owner/repo]   (token on stdin when --push)
"""
import argparse, base64, csv, json, os, sqlite3, sys, urllib.request, urllib.error
from datetime import datetime, timezone

CORE = {"core", "runtime", "local", "unified", "dev", "gpu"}
# Manual corrections where the source list's segment is wrong (company ships agents, not sandboxes).
SEGMENT_OVERRIDE = {"cua (cua spaces, cua sdk)": "computer"}
ap = argparse.ArgumentParser()
ap.add_argument("--dir", required=True); ap.add_argument("--src", required=True)
ap.add_argument("--db", default=""); ap.add_argument("--out", required=True); ap.add_argument("--push", default="")
A = ap.parse_args()

def num(x):
    try: return int(float(x))
    except Exception: return None

def split(x): return [s.strip() for s in (x or "").split(";") if s.strip()]

src = {r["name"]: r for r in csv.DictReader(open(A.src))}
people = {}
for p in csv.DictReader(open(os.path.join(A.dir, "PEOPLE.csv"))):
    people.setdefault(p["company"], []).append({k: p[k] for k in ("name", "role", "linkedin", "x", "github", "source", "confidence")})

gh, prev_stars, disc, news, activity = {}, {}, {}, {}, []
if A.db and os.path.exists(A.db):
    c = sqlite3.connect(A.db)
    runs = [r[0] for r in c.execute("SELECT ts FROM runs ORDER BY ts DESC LIMIT 2")]
    if runs:
        for comp, repo, stars, forks, pushed, rel, rel_at, commits, hl in c.execute(
                "SELECT company,repo,stars,forks,pushed,release,release_at,commits,headlines FROM gh WHERE ts=?", (runs[0],)):
            gh[comp] = {"stars": stars, "forks": forks, "pushed": pushed, "release": rel, "release_at": rel_at, "building": json.loads(hl or "[]")[:8], "repo": repo}
            if commits:
                activity.append({"date": runs[0], "type": "Commits", "company": comp, "text": f"{commits} commits: " + "; ".join(json.loads(hl or "[]")[:3]), "url": f"https://github.com/{repo}/commits"})
        for comp, members, online in c.execute("SELECT company,members,online FROM discord WHERE ts=?", (runs[0],)):
            disc[comp] = (members, online)
        if len(runs) > 1:
            for comp, stars, rel_at in c.execute("SELECT company,stars,release_at FROM gh WHERE ts=?", (runs[1],)):
                prev_stars[comp] = (stars, rel_at)
    for comp, title, url, pts, created in c.execute("SELECT company,title,url,points,created FROM hn ORDER BY created DESC LIMIT 400"):
        news.setdefault(comp, []).append({"date": created[:10], "text": f"{title} (HN, {pts} pts)", "url": url})
        activity.append({"date": created[:10], "type": "Hacker News", "company": comp, "text": f"{title} ({pts} pts)", "url": url})
    for comp, g in gh.items():
        if g["release_at"]:
            news.setdefault(comp, []).append({"date": g["release_at"][:10], "text": f"Release {g['release']}", "url": f"https://github.com/{g['repo']}/releases"})
            if comp in prev_stars and prev_stars[comp][1] != g["release_at"]:
                activity.append({"date": g["release_at"][:10], "type": "Release", "company": comp, "text": f"Shipped {g['release']}", "url": f"https://github.com/{g['repo']}/releases"})

companies = []
for i, r in enumerate(csv.DictReader(open(os.path.join(A.dir, "DIRECTORY.csv")))):
    name, s, g = r["company"], src.get(r["company"], {}), gh.get(r["company"], {})
    r["segment"] = SEGMENT_OVERRIDE.get(name, r["segment"])
    pushed = g.get("pushed")
    lpd = (datetime.now(timezone.utc) - datetime.fromisoformat(pushed.replace("Z", "+00:00"))).days if pushed else num(r["last_push_days"])
    stars = g.get("stars", num(r["stars"]))
    gained = stars - prev_stars[name][0] if name in prev_stars and stars is not None else None
    members, online = disc.get(name, (num(r["discord_members"]), None))
    pct = round(100 * online / members, 1) if members and online is not None else (float(r["discord_online_pct"]) if r["discord_online_pct"] else None)
    if online is None and members and pct is not None: online = round(members * pct / 100)
    roles = split(r["open_roles"])
    ppl = people.get(name, [])
    score = (num(r["fit"]) or 0) * 5 + (25 if r["founding_roles"] else 12 if roles else 0) + (8 if any(p["x"] or p["linkedin"] for p in ppl) else 0) \
        + min(10, pct or 0) + (6 if lpd is not None and lpd <= 14 else 0) + min(10, (gained or 0) / 20)
    companies.append({
        "id": i, "name": name, "website": r["website"], "segment": r["segment"],
        "relevance": "core" if r["segment"] in CORE else "adjacent", "isolation": r["isolation"], "kind": r["kind"],
        "oss": r["open_source"] or "Unknown", "repo": r["repo"], "stars": stars, "forks": g.get("forks", num(r["forks"])),
        "stars_gained": gained if gained and gained > 0 else None, "last_push_days": lpd, "language": r["language"], "license": r["license"],
        "company_x": r["company_x"], "company_linkedin": r["company_linkedin"], "discord": r["discord"],
        "discord_members": members, "discord_online": online, "discord_online_pct": pct, "slack": r["slack"],
        "emails": split(r["emails"]), "people": ppl, "yc_batch": r["yc_batch"], "team_size": r["team_size"], "hq": r["hq"],
        "careers": r["careers"], "open_roles": roles, "founding_roles": split(r["founding_roles"]),
        "news": sorted(news.get(name, []), key=lambda n: n["date"], reverse=True)[:6], "building": g.get("building", []),
        "lane": r["reach_out_lane"], "channel": r["best_channel"], "hook": r["hook"], "note": (s.get("note") or "")[:220],
        "score": round(score, 1),
    })

for a in activity:
    if isinstance(a["date"], int): a["date"] = datetime.fromtimestamp(a["date"], timezone.utc).strftime("%Y-%m-%d")
activity.sort(key=lambda a: a["date"], reverse=True)
stats = {
    "companies": len(companies), "core": sum(c["relevance"] == "core" for c in companies),
    "open_source": sum(c["oss"].startswith("Open") for c in companies), "discord": sum(bool(c["discord"]) for c in companies),
    "with_contact": sum(any(p["x"] or p["linkedin"] for p in c["people"]) for c in companies),
    "hiring": sum(bool(c["open_roles"]) for c in companies), "founding": sum(bool(c["founding_roles"]) for c in companies),
}
data = {"generated_at": datetime.now(timezone.utc).isoformat(), "stats": stats, "companies": companies, "activity": activity[:300]}
body = json.dumps(data, separators=(",", ":"))
open(A.out, "w").write(body)
print(f"wrote {A.out}: {len(body)//1024} KB, {stats}")

if A.push:
    token = sys.stdin.readline().strip()
    api = f"https://api.github.com/repos/{A.push}/contents/public/data.json"
    h = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "sandbox-radar"}
    sha = None
    try:
        with urllib.request.urlopen(urllib.request.Request(api, headers=h), timeout=30) as r: sha = json.loads(r.read())["sha"]
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
    payload = {"message": f"data: refresh {data['generated_at'][:16]}Z", "content": base64.b64encode(body.encode()).decode()}
    if sha: payload["sha"] = sha
    req = urllib.request.Request(api, data=json.dumps(payload).encode(), headers=h, method="PUT")
    with urllib.request.urlopen(req, timeout=60) as r: print("pushed", r.status)
