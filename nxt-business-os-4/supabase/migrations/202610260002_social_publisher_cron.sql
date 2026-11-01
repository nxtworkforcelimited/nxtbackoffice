begin;
create schema if not exists nxt_private;
create or replace function nxt_private.dispatch_social_publisher()
returns bigint
language plpgsql security definer set search_path='' as $$
declare s text; request_id bigint;
begin
 select decrypted_secret into s from vault.decrypted_secrets where name='nxt_social_scheduler_secret' order by updated_at desc limit 1;
 if s is null then raise exception 'NXT social scheduler secret is not configured';end if;
 select net.http_get(
   url := 'https://nxt-business-os.vercel.app/api/social/publish',
   headers := jsonb_build_object('Authorization','Bearer '||s),
   timeout_milliseconds := 5000
 ) into request_id;
 return request_id;
end;$$;
revoke all on function nxt_private.dispatch_social_publisher() from public,anon,authenticated;
do $$begin
 if exists(select 1 from cron.job where jobname='nxt-social-publisher') then perform cron.unschedule('nxt-social-publisher');end if;
 perform cron.schedule('nxt-social-publisher','*/5 * * * *','select nxt_private.dispatch_social_publisher();');
end$$;
commit;
