"""Apply a hash-verified release delta on the isolated feature branch only."""
from pathlib import Path
import hashlib,json,subprocess

def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\x00'+data).hexdigest()

root=Path.cwd()
manifest=json.loads((root/'scripts/reviewed-release.json').read_text())
for item in manifest:
    path=root/item['path']
    if not item['path'].startswith('nxt-business-os-4/') or '..' in Path(item['path']).parts:
        raise RuntimeError('Unexpected release path')
    original=path.read_bytes()
    if blob(original)!=item['before']:
        raise RuntimeError('Base changed: '+item['path'])
    text=original.decode('utf8')
    for start,end,replacement in reversed(item['edits']):
        text=text[:start]+replacement+text[end:]
    result=text.encode('utf8')
    if blob(result)!=item['after']:
        raise RuntimeError('Result does not match the tested file: '+item['path'])
    path.write_bytes(result)
    print('Verified:',item['path'])
