#!/usr/bin/env python3
"""Count commits per day across all of LOGIN's public, non-fork repos (last 365 days)
and write data/activity.json. Standard library only. Uses GITHUB_TOKEN if set.

Counts commits by any human author on the default branch (bots and this profile
repo are skipped). That includes commits authored by AI tools, which GitHub's own
contribution graph does not credit to you.
"""
import datetime as dt, json, os, re, urllib.error, urllib.request
from collections import Counter
from pathlib import Path
from zoneinfo import ZoneInfo

LOGIN = os.environ.get("PROFILE_LOGIN", "EAGLERK")
TZ = ZoneInfo(os.environ.get("PROFILE_TZ", "Asia/Kolkata"))
OUT = Path(__file__).resolve().parent.parent / "data" / "activity.json"


def get_all(url):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": LOGIN}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    while url:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                yield from json.load(r)
                m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link", ""))
                url = m.group(1) if m else None
        except urllib.error.HTTPError as e:
            if e.code == 409:  # empty repository
                return
            raise


def main():
    today = dt.datetime.now(TZ).date()
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=366)).strftime("%Y-%m-%dT%H:%M:%SZ")
    days, repos = Counter(), {}
    for repo in get_all(f"https://api.github.com/users/{LOGIN}/repos?type=owner&per_page=100"):
        if repo["fork"] or repo["name"].lower() == LOGIN.lower():
            continue
        n, last = 0, None
        for c in get_all(f"https://api.github.com/repos/{LOGIN}/{repo['name']}/commits?since={since}&per_page=100"):
            who = ((c.get("author") or {}).get("login") or "") + c["commit"]["author"]["name"]
            if "[bot]" in who:
                continue
            d = dt.datetime.fromisoformat(c["commit"]["author"]["date"].replace("Z", "+00:00")).astimezone(TZ).date()
            if (today - d).days >= 365:
                continue
            days[d.isoformat()] += 1
            n += 1
            last = max(last or d.isoformat(), d.isoformat())
        repos[repo["name"]] = {"commits": n, "last": last}
    OUT.write_text(json.dumps({"source": "GitHub REST API", "generated": today.isoformat(), "login": LOGIN,
                               "days": dict(sorted(days.items())), "repos": repos}, indent=1) + "\n")
    print(f"{sum(days.values())} commits across {len(repos)} repos")


if __name__ == "__main__":
    main()
