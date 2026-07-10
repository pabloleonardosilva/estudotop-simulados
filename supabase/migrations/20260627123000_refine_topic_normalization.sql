begin;

create or replace function public.normalize_topic_name(value text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  token text;
  result text := '';
  token_index integer := 0;
begin
  cleaned := regexp_replace(btrim(coalesce(value, ''), E' \t\n\r.,:;-'), '[[:space:]]+', ' ', 'g');

  if cleaned = '' then
    return '';
  end if;

  foreach token in array regexp_split_to_array(lower(cleaned), ' ') loop
    token_index := token_index + 1;

    token := case token
      when '/etc' then '/etc'
      when 'api' then 'API'
      when 'cpu' then 'CPU'
      when 'css' then 'CSS'
      when 'dns' then 'DNS'
      when 'ftp' then 'FTP'
      when 'hd' then 'HD'
      when 'hdd' then 'HDD'
      when 'html' then 'HTML'
      when 'http' then 'HTTP'
      when 'https' then 'HTTPS'
      when 'ia' then 'IA'
      when 'iaas' then 'IaaS'
      when 'imap' then 'IMAP'
      when 'ip' then 'IP'
      when 'ipv4' then 'IPv4'
      when 'ipv6' then 'IPv6'
      when 'paas' then 'PaaS'
      when 'pdf' then 'PDF'
      when 'pop3' then 'POP3'
      when 'ram' then 'RAM'
      when 'rom' then 'ROM'
      when 'saas' then 'SaaS'
      when 'smtp' then 'SMTP'
      when 'ssd' then 'SSD'
      when 'ssh' then 'SSH'
      when 'ssl' then 'SSL'
      when 'tcp' then 'TCP'
      when 'tcp/ip' then 'TCP/IP'
      when 'ti' then 'TI'
      when 'url' then 'URL'
      when 'usb' then 'USB'
      when 'vpn' then 'VPN'
      when 'wi-fi' then 'Wi-Fi'
      when 'wifi' then 'Wi-Fi'
      when 'widows' then 'Windows'
      when 'onedrive' then 'OneDrive'
      when 'powerpoint' then 'PowerPoint'
      when 'macos' then 'macOS'
      else
        case
          when token_index > 1 and token in ('a', 'as', 'o', 'os', 'e', 'em', 'no', 'na', 'nos', 'nas', 'de', 'da', 'das', 'do', 'dos', 'para', 'por', 'com', 'sem', 'sob', 'sobre', 'entre') then token
          else initcap(token)
        end
    end;

    result := result || case when result = '' then '' else ' ' end || token;
  end loop;

  return result;
end;
$$;

delete from public.topics
where normalized_name = 'atalhos do widows';

update public.topics
set name = name;

commit;
