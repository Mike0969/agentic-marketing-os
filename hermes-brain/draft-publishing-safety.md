# Draft publishing safety

Inspired by X Article Publisher style formatting automation.

Allowed:

- formatting automation;
- platform-specific draft packaging;
- checklist generation;
- approved-draft preparation;
- controlled live publishing — but ONLY the operator triggers it.

Live posting is now wired (LinkedIn first) as a CONTROLLED capability. It fires only when ALL of:

1. `SOCIAL_POSTING_ENABLED=true`, AND
2. the operator explicitly clicks **Approve & Post** on a finished package in Ready to Post, AND
3. the brand has a connected account (OAuth token stored server-side).

Still blocked (never):

- agents or automation posting on their own;
- browser automation for posting;
- automatic approval;
- auto-posting from any loop, cron, or schedule.
