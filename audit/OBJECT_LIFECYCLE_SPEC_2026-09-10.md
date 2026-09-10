# FRAME object lifecycle contract — 2026-09-10

## Archive
- Explicit archive intent only: e.g. «отправь этот объект в архив», «архивируй Октябрьскую 16».
- Archive is reversible.
- Persist object status `archived`; keep orders, works, documents, closures, payments, purchases, expenses and historical finance data.
- Archived objects are excluded from active counters and attention queue, but remain available in Objects → Archive and in All objects.
- «верни из архива» restores object status to `work` through the normal Preview → Apply mutation boundary.

## Permanent delete
- Explicit object-delete intent only: e.g. «удали этот объект полностью», «удали объект Октябрьская 16».
- Never infer permanent delete from work deletion, completion, archive, or ordinary conversation.
- Resolve exactly one object. Ambiguity never mutates.
- Two sequential conversational confirmations are required in the same page session.
- Confirmation 1 repeats exact object label and asks whether to delete it completely.
- Confirmation 2 repeats that all object data will be permanently removed and asks again.
- Any negative/other reply, object change, page reload, stale revision or timeout cancels the delete session.
- Both affirmative messages must come from trusted user submissions.
- After confirmation 2, atomically delete the exact object only if its saved revision is unchanged.
- Purge object-scoped AI audit entries. Clear current target if it points to the deleted object. Reload objects.
- No undo for permanent deletion.

## Safety
- No owner database is used for automated tests.
- Test with synthetic objects only.
- Existing work delete remains separate and continues to use its existing confirmation boundary.
