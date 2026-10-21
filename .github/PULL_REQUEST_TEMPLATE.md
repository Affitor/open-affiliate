<!-- Adding or correcting a program? Fill this in. For code changes, replace it with what changed and why. -->

**Program page:** <!-- the brand's own affiliate or terms page that states every term below -->

- [ ] Every term in the file is stated on the program page above. A network listing (Dub, PartnerStack and similar) is not enough on its own.
- [ ] Terms the page does not state are left out, not guessed (cookie window, minimum payout, approval time).
- [ ] New file: `programs/<slug>.yaml`, the slug matches the file name, `verified: false`, `created_at` is the date you add it.
- [ ] `commission` has `type`, `rate`, `mode`, `value` and `currency`; `short_description` is 100 characters or fewer.
- [ ] The description is factual, with no ranking words such as "best" or "reliable".

A maintainer checks every term against the program page before merging, usually within a few days. Rules: [CONTRIBUTING.md](https://github.com/Affitor/open-affiliate/blob/main/CONTRIBUTING.md). How scoring works after merge: [openaffiliate.dev/docs/oas](https://openaffiliate.dev/docs/oas).
