begin;

do $drop_global_subject_name_uniqueness$
declare
  constraint_name text;
  index_name text;
begin
  for constraint_name in
    select constraint_record.conname
    from pg_constraint constraint_record
    join pg_class table_record on table_record.oid = constraint_record.conrelid
    join pg_namespace schema_record on schema_record.oid = table_record.relnamespace
    where schema_record.nspname = 'public'
      and table_record.relname = 'subjects'
      and constraint_record.contype = 'u'
      and constraint_record.conkey = array[
        (select attribute_record.attnum
         from pg_attribute attribute_record
         where attribute_record.attrelid = table_record.oid
           and attribute_record.attname = 'name')
      ]::smallint[]
  loop
    execute format('alter table public.subjects drop constraint %I', constraint_name);
  end loop;

  for index_name in
    select index_record.relname
    from pg_index index_metadata
    join pg_class table_record on table_record.oid = index_metadata.indrelid
    join pg_namespace schema_record on schema_record.oid = table_record.relnamespace
    join pg_class index_record on index_record.oid = index_metadata.indexrelid
    join pg_attribute attribute_record
      on attribute_record.attrelid = table_record.oid
     and attribute_record.attnum = index_metadata.indkey[0]
    left join pg_constraint constraint_record on constraint_record.conindid = index_metadata.indexrelid
    where schema_record.nspname = 'public'
      and table_record.relname = 'subjects'
      and index_metadata.indisunique
      and not index_metadata.indisprimary
      and index_metadata.indnkeyatts = 1
      and attribute_record.attname = 'name'
      and constraint_record.oid is null
  loop
    execute format('drop index public.%I', index_name);
  end loop;
end;
$drop_global_subject_name_uniqueness$;

create unique index if not exists unique_subjects_discipline_name
  on public.subjects (discipline_id, name);

commit;
