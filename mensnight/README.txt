MENS NIGHT LEAGUE WEBSITE - ADMIN / PUBLIC SPLIT

FILES
- index.html      Public page players can view
- admin.html      Private admin page for score entry
- app.js          Shared calculations + admin logic
- style.css       Shared styling
- league-data.json Shared data file used by both pages

HOW TO USE
1. Put all 5 files in the same website folder.
2. Open admin.html.
3. Default password is: mens2026
4. Enter teams, players, weekly scores, attendance, square board numbers, sponsor adds, KP result, and hole assignments.
5. Click Export league-data.json.
6. Upload the new league-data.json beside index.html.
7. Players refresh index.html and see the latest standings.

IMPORTANT
- This is a STATIC website setup.
- The password lock is only basic client-side convenience, not secure backend protection.
- For a truly live shared backend, you would later connect this to Firebase, Supabase, Airtable, or another database.

LEAGUE RULES CURRENTLY BUILT IN
- 3-week preseason: May 5, May 12, May 19
- Official season starts May 26 and ends Sept 8, 2026
- 4 official segments of 4 weeks each
- One lowest points week dropped in each in-season segment only
- No dropped preseason score
- Week 1 handicap = 0
- Future handicaps based on average prior weekly score difference from best score
- Handicap rounded to nearest whole number
- Handicap capped at 6
- Weekly handicap increase capped at +2
- Net score = gross score minus handicap
- Weekly points based on net finish with tie-averaging
- Year-end standings use all official season points with no dropped weeks

NOTE ABOUT SCORES
- Enter golf scores as numbers like -6, -3, 0, 2.
- More negative is better.
