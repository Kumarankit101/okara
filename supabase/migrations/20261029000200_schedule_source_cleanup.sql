create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'okara-delete-expired-source-posts',
  '0 * * * *',
  $$select public.delete_expired_source_posts();$$
);

comment on extension pg_cron is
  'Schedules Okara source-post cleanup inside Postgres so hourly retention does not depend on the web host plan.';
