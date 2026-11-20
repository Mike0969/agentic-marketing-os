-- Campaign templates per brand (admin 2026-11-20: "template SOME parts; only in CONTENT and VISUAL let it
-- use its imagination"). The plan, SEO/hashtags, CTA, measurement, posting time, slide footer and the
-- review checklist come from the brand fields + these templates, with no model calls. Safe to re-run.

alter table brands add column if not exists tpl_success_criteria text;
alter table brands add column if not exists tpl_measure text;
alter table brands add column if not exists tpl_hashtags text;
alter table brands add column if not exists tpl_posting_time text;
alter table brands add column if not exists tpl_review_checklist text;
alter table brands add column if not exists tpl_slide_footer text;

update brands set
  tpl_success_criteria = coalesce(tpl_success_criteria, 'More followers and likes from our own community; every post approved by the admin before it goes out.'),
  tpl_measure = coalesce(tpl_measure, E'Followers gained during the campaign (platform insights)\nLikes, comments and saves per post (platform insights)\nClicks on the link in bio (link analytics)'),
  tpl_posting_time = coalesce(tpl_posting_time, '09:00'),
  tpl_review_checklist = coalesce(tpl_review_checklist, E'Fits the brand voice\nNo claim the prohibited-claims list forbids\nNo invented numbers or results\nClear call to action');

notify pgrst, 'reload schema';
