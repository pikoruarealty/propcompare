# Owner acceptance checks (things only a person can confirm in the running app)

Written 2026-09-20 so these do not live only in chat. Start the app with `bun run dev`, sign in at `/admin/login` (local admin: `admin@propcompare.test`; the throwaway local password is in the earlier chats and the verify scripts), Docker Postgres running. Use a throwaway "ZZ Test" developer and property for the checks that change data, then choose **Delete** in the listing controls (a soft delete; ask for the rows to be purged if wanted).

## A. The three checks still to run

**1. The publisher applies `developer.name`.** Create the developer "ZZ Test Developer", add a property "ZZ Test Tower" manually for it (name, type, city, locality, and unit types "Type A" and "Type B") and publish. Then **Edit this property**, change "Developer name" on the Developer tab to "ZZ Test Developer Renamed", and publish. Expect: Admin → Developers shows the new name; `/properties/zz-test-tower` shows it under the title; the versions list (now at the end of the page) shows `Developer name: ZZ Test Developer → ZZ Test Developer Renamed`; Kimana's developer is unchanged. (Developer names are deliberately not unique; renaming to another developer's name is allowed.)

**2. The scheduler creates a draft in the queue.** Kimana is not due (its record already shows the June quarter filed). Clear its check history, then run the worker once:

```powershell
docker exec -i propcompare-postgres-1 psql -U propcompare -d propcompare -c "delete from rera_fetch_jobs where property_id = (select id from properties where slug='the-kimana-towers') or submission_id in (select id from property_submissions where property_id = (select id from properties where slug='the-kimana-towers'))"
bun run rera:worker
```

Expect within about 15 seconds `[rera-worker] check <id>: proposed`; stop with Ctrl+C (it makes about eight real requests to GujRERA). In the queue, The Kimana Towers shows **Update to a live listing**, **From RERA**, Draft; its values are "Needs review" (possession status "Under construction", carpet area per unit type: 3,977.70 sq ft for the first type and so on). Kimana's public page is unchanged until it is reviewed and published. Optional: reject it, clear the history again, run the worker again; the log says `already_declined` and no new draft appears. While the history is cleared, the "Source: GujRERA" lines on Kimana's page disappear until the next check.

**3. Edits no longer list removed unit types.** On the throwaway property: **Edit this property**, Unit types tab, select "Type B", **Remove this unit type**, publish. The buyer page shows only Type A. Start another edit: only Type A is listed (before the fix Type B still appeared and saving would bring it back).

## B. New since 2026-09-20 (please try)

- **A stuck submission.** Open a submission that was approved before its pictures were reviewed: it now opens, its fields are editable, and each picture has Approve and Reject; Publish is on the page. (This was a bug: it was locked once approved.)
- **The new add flow.** Add a property manually: type into fields directly (no Edit button), watch "Saved" appear when you leave a field, use **Next** at the bottom of each section (and **Save draft and leave** to stop), see the "N of M fields filled in" line, and at the end press **Publish** (one step; if anything is unconfirmed it tells you what and asks). Pictures you upload are approved and public by default (reject one to make it private). Version history is at the bottom.
- **Pictures on a live property.** On an edit, the Images tab lists the live pictures with "Take off the listing" and "Keep this picture"; publish; the picture is gone from the dossier and cards but not deleted.
- **Comparison.** Press **Compare** on two or three property cards, open the tray's Compare button, switch a property's unit type inside the table, collapse sections, copy the link and open it in a private window.
- **Sign-in redirects.** While signed in, `/admin/login` sends you to the admin; signed out, any `/admin/...` address sends you to the login.

## C. Owner decisions and actions still open

- Add OpenRouter credit (brochure categorization and extraction are blocked without it).
- Add 2 to 3 more properties with good pictures (Amaris is a good one: real RERA number `PR/GJ/AHMEDABAD/AHMEDABAD CITY/Ahmedabad Municipal Corporation/RAA15836/150925/310729`, four blocks, twelve carpet areas) so the visual redesign can be judged on real data.
- Pick the hero tagline (see `docs/design/visual-direction.v1.md`; "Compare homes, not brochures" was rejected because the data comes from brochures).
- Review the publish-logic changes flagged since 2026-09-20: removals (amenities, unit types, pictures), unlist/delete/restore, the publisher applying `developer.name`, the scheduler creating drafts, editing and reviewing at every stage before publication, and the one-step owner Publish.
- Send the email to `inforera@gujarat.gov.in` about GujRERA's Copyright versus Disclaimer wording (`DECISIONS.md` 2026-09-20).
- Field-by-field spot-check of Kimana and Amaris against the brochures, and a paid re-run to test the unit-aware extraction prompt (deferred by the owner).
- Agree the merge of `task/phase-2a-completion` into `main`, then the push.
