# Durable active-ticket state

For any task expected to require more than one context window, maintain:

`docs/journal/ACTIVE-TICKET-STATE.md`

It must stay under 180 lines and contain only:

- ticket and one question;
- authoritative inputs;
- exact acceptance criteria;
- decisions already made;
- files changed;
- tests run and results;
- current blocker, if any;
- exact next action;
- out-of-scope parking lot;
- stop condition.

Update it after a meaningful implementation milestone and immediately before context compaction when possible.

After compaction, read this file before any other repository exploration.
