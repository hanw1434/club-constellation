#!/usr/bin/env bash
# Re-fetch every public source signed out (3 s apart), then parse and rebuild data/.
# Run from the project root. Takes ~25 minutes, mostly the polite delay.
set -euo pipefail

python3 -I scripts/fetch.py raw \
  "ics=https://soco.college.harvard.edu/ics_helper?TB_iframe=true&embed=1&height=550&modal=true&mode=set&width=850" \
  "gsas=https://engage.gsas.harvard.edu/club_signup?view=all" \
  "hms=https://soho.hms.harvard.edu/club_signup?view=all" \
  "hls=https://hls.harvard.edu/student-life/student-orgs/student-organization-directory/" \
  "seas=https://seas.harvard.edu/office-student-organizations/find-seas-affiliated-student-organization" \
  "hbs=https://www.hbs.edu/mba/student-life/activities-government-and-clubs/student-clubs"

python3 -I scripts/parse_sources.py raw data/sources   # first pass: gives the HBS club list

python3 -I -c "import json;print('\n'.join(f\"{r['source_id']}={r['directory_url']}\" for r in json.load(open('data/sources/hbs.json'))))" \
  | xargs python3 -I scripts/fetch.py raw/hbs

# SOCO club page numbers come from the signed-in listing (see README); fetching them is signed out
tr ' ' '\n' < data/sources/soco_page_ids.txt | grep ':' \
  | awk -F: '{print $1"=https://soco.college.harvard.edu/"$2"/home/"}' \
  | xargs python3 -I scripts/fetch.py raw/soco

python3 -I scripts/parse_sources.py raw data/sources
python3 -I scripts/build_data.py
