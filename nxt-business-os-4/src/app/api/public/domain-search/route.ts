type DomainStatus = 'available' | 'unavailable' | 'unconfirmed';
type DomainResult = {domain: string; status: DomainStatus; source: string};

// Registry RDAP bases published in IANA's DNS bootstrap directory.
const rdapBases: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/',
  net: 'https://rdap.verisign.com/net/v1/',
  org: 'https://rdap.publicinterestregistry.org/rdap/',
  uk: 'https://rdap.nominet.uk/uk/',
};

function candidates(input: unknown): string[] {
  if (typeof input !== 'string' || input.length > 253) return [];
  let name = input.trim().toLowerCase().replace(/\.$/, '');
  if (name.startsWith('www.')) name = name.slice(4);
  if (!name.includes('.')) name = name.replace(/\s+/g, '-');
  const labels = name.split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return [];
  if (labels.length === 1) return ['co.zw', 'com', 'co.uk', 'co.za'].map(tld => name + '.' + tld);
  if (!/^[a-z]{2,63}$/.test(labels.at(-1)!)) return [];
  return [name];
}

async function registryLookup(domain: string, base: string, local = false): Promise<DomainResult> {
  const result: DomainResult = {domain, status: 'unconfirmed', source: local ? 'ZISPA' : 'Registry'};
  try {
    const response = await fetch(base + encodeURIComponent(domain), {
      headers: {Accept: 'application/rdap+json'},
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    const record = await response.json();
    if (!Array.isArray(record?.rdapConformance)) return result;
    if (response.status === 200 && record.ldhName?.toLowerCase() === domain) {
      result.status = 'unavailable';
    }
    // ZISPA's public search defines a genuine RDAP 404 as available, subject to its terms.
    // A generic HTTP 404, timeout or missing DNS record never proves availability.
    if (local && response.status === 404 && record.errorCode === 404) result.status = 'available';
  } catch {
    // Keep the enquiry route available when a registry cannot answer.
  }
  return result;
}

async function internationalLookup(domains: string[]): Promise<DomainResult[]> {
  if (!domains.length) return [];
  const answers = new Map<string, boolean>();
  try {
    const response = await fetch('https://api.vercel.com/v1/registrar/domains/search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({domains}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data?.results)) {
        for (const row of data.results) {
          if (domains.includes(row?.domain) && typeof row.available === 'boolean') {
            answers.set(row.domain, row.available);
          }
        }
      }
    }
  } catch {
    // A failed availability request may still have a confirmed registered RDAP record.
  }
  return Promise.all(domains.map(async domain => {
    if (answers.get(domain) === true) return {domain, status: 'available' as const, source: 'Registrar'};
    const base = rdapBases[domain.split('.').at(-1)!];
    if (base) return registryLookup(domain, base + 'domain/');
    // Registrar search can return false for both unavailable and unconfirmed names.
    return {domain, status: 'unconfirmed' as const, source: 'Registrar'};
  }));
}

export async function POST(request: Request) {
  const headers = {'Cache-Control': 'private, no-store'};
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({error: 'Please search from the NXT domain page.'}, {status: 403, headers});
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({error: 'Send a domain name as JSON.'}, {status: 415, headers});
  }
  if (Number(request.headers.get('content-length')) > 1024) {
    return Response.json({error: 'Please enter one name at a time.'}, {status: 413, headers});
  }
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 1024) return Response.json({error: 'Please enter one name at a time.'}, {status: 413, headers});
    input = JSON.parse(body)?.name;
  } catch {
    return Response.json({error: 'Please enter a business name or domain.'}, {status: 400, headers});
  }
  const domains = candidates(input);
  if (!domains.length) {
    return Response.json({error: 'Enter a name such as mybusiness or mybusiness.co.zw. Use letters, numbers and hyphens, with up to 63 characters per part.'}, {status: 400, headers});
  }
  const local = domains.filter(domain => /^[^.]+\.co\.zw$/.test(domain));
  const international = domains.filter(domain => !local.includes(domain));
  const [zwResults, otherResults] = await Promise.all([
    Promise.all(local.map(domain => registryLookup(domain, 'https://www.zispa.org.zw/api/domain/', true))),
    internationalLookup(international),
  ]);
  const results = [...zwResults, ...otherResults];
  return Response.json({
    results: domains.map(domain => results.find(result => result.domain === domain)),
    checkedAt: new Date().toISOString(),
  }, {headers});
}
